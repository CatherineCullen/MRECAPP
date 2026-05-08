'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { generateLessonMonth } from '@/lib/lessons/monthly/operations'

const PATH = '/chia/lessons-events/configuration/calendar'

/**
 * After a calendar change that affects which dates are open for lessons,
 * regenerate any pending lesson_month rows for the affected (year, month).
 * Status='Pending' months haven't been invoiced yet, so it's safe to
 * delete and re-create the rows from scratch — picks up the new
 * barn_closed state on every date.
 *
 * Status='Invoiced' or 'Paid' months are NOT touched (the rider has
 * already been billed; closing a date after the fact is admin's
 * responsibility to handle out-of-band, e.g. by issuing a credit).
 *
 * Quiet failure mode pre-fix: admin closed a date in a future month,
 * but the pending lesson_month for that month still showed the old
 * lesson_count + total. When the invoice went out, the rider got
 * billed for a closed day. This hook closes the gap.
 */
async function recomputePendingMonthsFor(
  supabase: ReturnType<typeof createAdminClient>,
  year: number,
  month: number,
): Promise<{ recomputed: number }> {
  const { data: pending, error } = await supabase
    .from('lesson_month')
    .select('id, subscription_id, year, month, per_lesson_price, is_prorated')
    .eq('year', year)
    .eq('month', month)
    .eq('status', 'Pending')
    .is('deleted_at', null)
  if (error) throw new Error(`Failed to load pending lesson_months: ${error.message}`)
  if (!pending || pending.length === 0) return { recomputed: 0 }

  for (const lm of pending) {
    // Hard-delete in dependency order: lesson_rider → lesson → lesson_month.
    // These rows are 'Pending' / 'pending' / 'pending' respectively, so no
    // user-visible state is lost — they'll be re-created with fresh counts.
    const { data: lessons } = await supabase
      .from('lesson')
      .select('id')
      .eq('month_id', lm.id)
    const lessonIds = (lessons ?? []).map((l) => l.id)
    if (lessonIds.length > 0) {
      await supabase.from('lesson_rider').delete().in('lesson_id', lessonIds)
      await supabase.from('lesson').delete().in('id', lessonIds)
    }
    await supabase.from('lesson_month').delete().eq('id', lm.id)

    // Re-generate. Reuse the snapshot fields so the new row matches the
    // old one's pricing + proration flag exactly.
    await generateLessonMonth({
      db:             supabase,
      subscriptionId: lm.subscription_id,
      year:           lm.year,
      month:          lm.month,
      perLessonPrice: Number(lm.per_lesson_price),
      isProrated:     lm.is_prorated,
    })
  }

  return { recomputed: pending.length }
}

/** Helper: read a barn_calendar_day's date so we know which (year, month) to recompute. */
async function dayYearMonth(
  supabase: ReturnType<typeof createAdminClient>,
  dayId: string,
): Promise<{ year: number; month: number } | null> {
  const { data } = await supabase
    .from('barn_calendar_day')
    .select('date')
    .eq('id', dayId)
    .maybeSingle()
  if (!data?.date) return null
  const [y, m] = data.date.split('-').map(Number)
  return { year: y, month: m }
}

export async function toggleDayClosed(dayId: string, closed: boolean) {
  const supabase = createAdminClient()
  const ym = await dayYearMonth(supabase, dayId)
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ barn_closed: closed, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  // Recompute pending lesson_months for this date's month so closures
  // propagate immediately.
  if (ym) await recomputePendingMonthsFor(supabase, ym.year, ym.month)
  revalidatePath(PATH)
  revalidatePath('/chia/lessons-events/monthly-billing')
  revalidatePath('/chia/lessons-events')
}

export async function toggleDayMakeup(dayId: string, isMakeup: boolean) {
  // is_makeup_day doesn't affect lesson_month generation under the
  // monthly model (ADR-0019 dropped the makeup-window concept). No
  // recompute needed.
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ is_makeup_day: isMakeup, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  revalidatePath(PATH)
}

export async function updateDayNote(dayId: string, notes: string | null) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ notes: notes?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  revalidatePath(PATH)
}

/**
 * Seed barn_calendar_day rows for an entire month. Idempotent — existing
 * rows for a date in the month are left alone, new rows are created with
 * default barn_closed=false, is_makeup_day=false. Used to extend the
 * calendar forward as the year progresses.
 */
export async function seedMonth(year: number, month: number) {
  const supabase = createAdminClient()

  // Compute month start/end (calendar month, 1st through last)
  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0) // 0th day of next month = last day of this month

  const { data: existing } = await supabase
    .from('barn_calendar_day')
    .select('date')
    .gte('date', startDate.toISOString().slice(0, 10))
    .lte('date', endDate.toISOString().slice(0, 10))

  const existingDates = new Set((existing ?? []).map(r => r.date))
  const rows: { date: string; barn_closed: boolean; is_makeup_day: boolean }[] = []

  const cur = new Date(startDate)
  while (cur <= endDate) {
    const iso = cur.toISOString().slice(0, 10)
    if (!existingDates.has(iso)) {
      rows.push({ date: iso, barn_closed: false, is_makeup_day: false })
    }
    cur.setDate(cur.getDate() + 1)
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('barn_calendar_day').insert(rows)
    if (error) throw error
  }

  // If the seeded month already had pending lesson_months (e.g. month was
  // partially seeded before, or admin re-seeds to fill a gap), regenerate
  // them so they pick up the new dates.
  await recomputePendingMonthsFor(supabase, year, month)

  revalidatePath(PATH)
  revalidatePath('/chia/lessons-events/monthly-billing')
  revalidatePath('/chia/lessons-events')
  return { inserted: rows.length }
}
