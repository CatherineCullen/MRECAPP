'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const PATH = '/chia/lessons-events/configuration/calendar'

export async function toggleDayClosed(dayId: string, closed: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('barn_calendar_day')
    .update({ barn_closed: closed, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) throw error
  revalidatePath(PATH)
}

export async function toggleDayMakeup(dayId: string, isMakeup: boolean) {
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

  revalidatePath(PATH)
  return { inserted: rows.length }
}
