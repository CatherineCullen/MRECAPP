'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { stripe } from '@/lib/stripe/server'
import { generateLessonDates, type DayOfWeek } from '../_lib/generateLessonDates'

// Quarterly Renewal — admin actions.
//
// These are split small and targeted rather than one god-action so that
// "uncheck 3 rows and hit Create Pending" maps cleanly to the UI.

/**
 * Clone the given source subscriptions from the current quarter into the next
 * quarter as Pending subs + Pending lessons. Idempotent: if a pending sub
 * already exists for the rider+slot+instructor in the next quarter, that row
 * is skipped (not duplicated).
 *
 * The source subscriptions' `renewal_intent` is left alone — creating the
 * pending rows is the admin's way of saying "go ahead with renewal," but the
 * source sub's renewal_intent column is a separate signal (used by Opt Out
 * and admin's "Not Renewing" toggle). We trust the caller to pass only
 * intent='renewing' IDs.
 *
 * Lessons are inserted with `status = 'pending'` — the Stripe invoice.paid
 * webhook will flip them to 'scheduled' when the invoice is paid. Until then
 * they don't appear on the rider's My Schedule view.
 */
export async function createPendingSubscriptions(
  sourceSubscriptionIds: string[],
): Promise<{ created: number; skipped: number; error?: string }> {
  if (sourceSubscriptionIds.length === 0) {
    return { created: 0, skipped: 0, error: 'Nothing selected.' }
  }

  const user = await getCurrentUser()
  const db   = createAdminClient()

  // 1) Resolve source subs
  const { data: sources, error: srcErr } = await db
    .from('lesson_subscription')
    .select(`
      id, rider_id, billed_to_id, instructor_id, default_horse_id,
      lesson_day, lesson_time, subscription_price, subscription_type,
      quarter:quarter ( id, start_date, end_date )
    `)
    .in('id', sourceSubscriptionIds)
    .is('deleted_at', null)

  if (srcErr) return { created: 0, skipped: 0, error: srcErr.message }
  if (!sources || sources.length === 0) {
    return { created: 0, skipped: 0, error: 'Source subscriptions not found.' }
  }

  // 2) Resolve the next quarter (first quarter starting after the source quarter ends).
  //    We assume all sources share the same current quarter — the renewal tab
  //    only surfaces one.
  const sourceQuarterEndDate = sources[0].quarter?.end_date
  if (!sourceQuarterEndDate) {
    return { created: 0, skipped: 0, error: 'Source quarter has no end_date.' }
  }

  const { data: nextQuarter } = await db
    .from('quarter')
    .select('id, start_date, end_date, label')
    .is('deleted_at', null)
    .gt('start_date', sourceQuarterEndDate)
    .order('start_date')
    .limit(1)
    .maybeSingle()

  if (!nextQuarter) {
    return {
      created: 0,
      skipped: 0,
      error: 'No next quarter found. Create the next quarter in Configuration first.',
    }
  }

  // 3) Load calendar days for the next quarter once (reused per-sub)
  const { data: calendarDays } = await db
    .from('barn_calendar_day')
    .select('date, barn_closed, is_makeup_day')
    .eq('quarter_id', nextQuarter.id)
    .order('date')

  const calDays = (calendarDays ?? []).map(d => ({
    date:          d.date,
    barn_closed:   d.barn_closed,
    is_makeup_day: d.is_makeup_day,
  }))

  // 4) Find any existing pending subs already in the next quarter — dedupe key
  //    is (rider, day, time, instructor).
  const { data: existing } = await db
    .from('lesson_subscription')
    .select('id, rider_id, lesson_day, lesson_time, instructor_id')
    .eq('quarter_id', nextQuarter.id)
    .is('deleted_at', null)

  const existingKeys = new Set(
    (existing ?? []).map(e => `${e.rider_id}|${e.lesson_day}|${e.lesson_time}|${e.instructor_id}`),
  )

  let created = 0
  let skipped = 0
  const errors: string[] = []

  // 5) Create each pending sub one at a time. We could bulk-insert
  //    subscriptions, but we need the returned IDs to insert lessons +
  //    lesson_riders, and we want one sub's failure not to torpedo others.
  for (const src of sources) {
    const key = `${src.rider_id}|${src.lesson_day}|${src.lesson_time}|${src.instructor_id}`
    if (existingKeys.has(key)) {
      skipped++
      continue
    }

    const lessonDates = generateLessonDates({
      dayOfWeek:    src.lesson_day as DayOfWeek,
      startDate:    nextQuarter.start_date,
      endDate:      nextQuarter.end_date,
      calendarDays: calDays,
    })

    if (lessonDates.length === 0) {
      errors.push(`No lesson dates for ${src.lesson_day} in ${nextQuarter.label}.`)
      continue
    }

    // Insert the pending subscription
    const { data: newSub, error: subErr } = await db
      .from('lesson_subscription')
      .insert({
        rider_id:           src.rider_id,
        billed_to_id:       src.billed_to_id,
        quarter_id:         nextQuarter.id,
        lesson_day:         src.lesson_day,
        lesson_time:        src.lesson_time,
        instructor_id:      src.instructor_id,
        default_horse_id:   src.default_horse_id,
        subscription_price: src.subscription_price,
        subscription_type:  src.subscription_type,
        status:             'pending',
        renewal_intent:     'renewing',
        created_by:         user?.personId ?? null,
      })
      .select('id')
      .single()

    if (subErr || !newSub) {
      errors.push(`Failed to create sub for ${src.rider_id}: ${subErr?.message ?? 'unknown'}`)
      continue
    }

    // Insert pending lessons (status='pending' — webhook flips to scheduled)
    const lessonRows = lessonDates.map(date => ({
      instructor_id: src.instructor_id,
      lesson_type:   'private' as const,
      // lesson_time is already 'HH:MM:SS' from Postgres time type — no need
      // to append seconds.
      scheduled_at:  `${date}T${src.lesson_time}`,
      status:        'pending' as const,
      created_by:    user?.personId ?? null,
    }))

    const { data: lessons, error: lessonErr } = await db
      .from('lesson')
      .insert(lessonRows)
      .select('id')

    if (lessonErr || !lessons) {
      // Roll back the sub we just created — it has no lessons, so it's useless.
      await db.from('lesson_subscription').delete().eq('id', newSub.id)
      errors.push(`Failed to create lessons for ${src.rider_id}: ${lessonErr?.message ?? 'unknown'}`)
      continue
    }

    // Insert lesson_rider junctions
    const riderRows = lessons.map(l => ({
      lesson_id:       l.id,
      rider_id:        src.rider_id,
      horse_id:        src.default_horse_id,
      subscription_id: newSub.id,
      package_id:      null,
    }))

    const { error: riderErr } = await db.from('lesson_rider').insert(riderRows)

    if (riderErr) {
      await db.from('lesson').delete().in('id', lessons.map(l => l.id))
      await db.from('lesson_subscription').delete().eq('id', newSub.id)
      errors.push(`Failed to create lesson_rider for ${src.rider_id}: ${riderErr.message}`)
      continue
    }

    created++
    existingKeys.add(key)
  }

  revalidatePath('/chia/lessons-events/renewal')
  revalidatePath('/chia/lessons-events/subscriptions')
  revalidatePath('/chia/lessons-events')

  return {
    created,
    skipped,
    error: errors.length > 0 ? errors.join(' / ') : undefined,
  }
}

/**
 * Mark a source subscription as Not Renewing. If a pending sub for next
 * quarter was already created, it (and its pending lessons) are soft-deleted.
 * Lessons that are already `scheduled` are left alone — those only exist if
 * the pending invoice was already paid, in which case the rider owns them and
 * admin should use the regular cancellation flow instead.
 */
export async function markNotRenewing(
  sourceSubscriptionId: string,
): Promise<{ error?: string }> {
  const db = createAdminClient()
  const now = new Date().toISOString()

  // Flip the source sub's intent
  const { error: intentErr } = await db
    .from('lesson_subscription')
    .update({ renewal_intent: 'not_renewing' })
    .eq('id', sourceSubscriptionId)

  if (intentErr) return { error: intentErr.message }

  // Find + soft-delete any pending next-quarter sub created off this source.
  // Match by (rider, day, time, instructor) in any quarter past this one.
  const { data: src } = await db
    .from('lesson_subscription')
    .select(`
      rider_id, lesson_day, lesson_time, instructor_id,
      quarter:quarter ( end_date )
    `)
    .eq('id', sourceSubscriptionId)
    .maybeSingle()

  if (!src || !src.quarter?.end_date) return {}

  const { data: pendingSubs } = await db
    .from('lesson_subscription')
    .select(`
      id, status, invoice_id,
      invoice:invoice ( id, status, deleted_at ),
      quarter:quarter ( start_date )
    `)
    .eq('rider_id', src.rider_id)
    .eq('lesson_day', src.lesson_day)
    .eq('lesson_time', src.lesson_time)
    .eq('instructor_id', src.instructor_id)
    .eq('status', 'pending')
    .is('deleted_at', null)

  const toDelete = (pendingSubs ?? []).filter(p =>
    p.quarter?.start_date && p.quarter.start_date > src.quarter!.end_date,
  )

  // Safety: if any pending sub already has a live (non-deleted, non-void)
  // invoice attached, refuse. Admin must void the invoice first via the
  // Invoices tab — otherwise we'd leave a live Stripe invoice pointing at a
  // soft-deleted subscription, which is what caused the "row keeps coming
  // back as renewable + overdue invoice hangs around" bug Catherine hit.
  const hasLiveInvoice = toDelete.some(p => {
    if (!p.invoice_id) return false
    const inv = p.invoice as { id: string; status: string; deleted_at: string | null } | null
    if (!inv || inv.deleted_at) return false
    // 'overdue' here is our stand-in for "voided" — treat as already cancelled.
    return inv.status === 'draft' || inv.status === 'sent'
  })

  if (hasLiveInvoice) {
    // Undo the intent flip we already did so state stays consistent.
    await db
      .from('lesson_subscription')
      .update({ renewal_intent: 'renewing' })
      .eq('id', sourceSubscriptionId)
    return {
      error: 'This rider has a live invoice for next quarter. Void & cancel it from the Invoices tab first — that will also mark them as not renewing.',
    }
  }

  for (const p of toDelete) {
    // Soft-delete pending lessons tied to this sub (via lesson_rider) — only
    // those still in 'pending' status. Anything 'scheduled' means the invoice
    // paid already (shouldn't happen for a pending sub, but be safe).
    const { data: links } = await db
      .from('lesson_rider')
      .select('lesson_id, lesson:lesson(id, status)')
      .eq('subscription_id', p.id)
      .is('deleted_at', null)

    const pendingLessonIds = (links ?? [])
      .filter(l => l.lesson?.status === 'pending')
      .map(l => l.lesson_id)

    if (pendingLessonIds.length > 0) {
      await db
        .from('lesson')
        .update({ deleted_at: now })
        .in('id', pendingLessonIds)
    }

    await db
      .from('lesson_subscription')
      .update({ deleted_at: now })
      .eq('id', p.id)
  }

  revalidatePath('/chia/lessons-events/renewal')
  revalidatePath('/chia/lessons-events/subscriptions')
  revalidatePath('/chia/lessons-events')
  return {}
}

/**
 * DEV RESET — wipes the entire next-quarter renewal state so admin can start
 * over from a clean slate. Soft-deletes every pending subscription and its
 * pending lessons in the next quarter, discards/voids every attached Stripe
 * invoice + CHIA invoice row, and resets every source sub's renewal_intent
 * back to 'renewing'.
 *
 * Intended for testing only. Paid invoices are left alone (those already
 * cascaded to active — don't undo real money).
 */
export async function resetNextQuarterRenewal(): Promise<{
  ok: true
  voidedInvoices: number
  deletedDrafts: number
  softDeletedSubs: number
  softDeletedLessons: number
  resetIntents: number
} | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Find current + next quarter
  const { data: quarters } = await db
    .from('quarter')
    .select('id, start_date, end_date, is_active')
    .is('deleted_at', null)
    .order('start_date')

  const all = quarters ?? []
  const current =
    all.find(q => q.is_active) ??
    all.find(q => q.start_date <= today && q.end_date >= today) ??
    null
  if (!current) return { ok: false, error: 'No current quarter.' }

  const next = all.find(q => q.start_date > current.end_date)
  if (!next) return { ok: false, error: 'No next quarter.' }

  // 1) Load every pending sub in next quarter (not deleted)
  const { data: pendingSubs } = await db
    .from('lesson_subscription')
    .select('id, invoice_id, rider_id, lesson_day, lesson_time, instructor_id')
    .eq('quarter_id', next.id)
    .eq('status', 'pending')
    .is('deleted_at', null)

  const subs = pendingSubs ?? []

  // 2) Collect distinct invoice_ids — load invoice rows to know draft vs sent
  const invoiceIds = Array.from(new Set(subs.map(s => s.invoice_id).filter(Boolean))) as string[]
  const { data: invoices } = invoiceIds.length > 0
    ? await db
        .from('invoice')
        .select('id, status, stripe_invoice_id, deleted_at')
        .in('id', invoiceIds)
    : { data: [] as Array<{ id: string; status: string; stripe_invoice_id: string | null; deleted_at: string | null }> }

  let voidedInvoices = 0
  let deletedDrafts = 0

  for (const inv of invoices ?? []) {
    if (inv.deleted_at) continue
    if (inv.status === 'paid') continue // don't touch real money
    if (inv.status === 'voided') continue // already voided, nothing to do on Stripe

    // Stripe cleanup first
    if (inv.stripe_invoice_id) {
      try {
        if (inv.status === 'draft') {
          await stripe.invoices.del(inv.stripe_invoice_id)
          deletedDrafts++
        } else {
          await stripe.invoices.voidInvoice(inv.stripe_invoice_id)
          voidedInvoices++
        }
      } catch (e) {
        console.warn('[resetNextQuarterRenewal] Stripe cleanup failed for', inv.stripe_invoice_id, e)
      }
    }
  }

  const now = new Date().toISOString()

  // 3) Soft-delete invoice rows + their line items. Unlink subs first so the
  //    FK doesn't point at a soft-deleted invoice.
  if (invoiceIds.length > 0) {
    await db
      .from('lesson_subscription')
      .update({ invoice_id: null })
      .in('invoice_id', invoiceIds)

    await db
      .from('invoice_line_item')
      .update({ deleted_at: now })
      .in('invoice_id', invoiceIds)
      .is('deleted_at', null)

    await db
      .from('invoice')
      .update({ deleted_at: now })
      .in('id', invoiceIds)
      .is('deleted_at', null)
  }

  // 4) Soft-delete pending lessons linked to these subs, then the subs.
  let softDeletedLessons = 0
  const subIds = subs.map(s => s.id)
  if (subIds.length > 0) {
    const { data: links } = await db
      .from('lesson_rider')
      .select('lesson_id, lesson:lesson(id, status)')
      .in('subscription_id', subIds)
      .is('deleted_at', null)

    const lessonIds = (links ?? [])
      .filter(l => l.lesson?.status === 'pending')
      .map(l => l.lesson_id)

    if (lessonIds.length > 0) {
      await db.from('lesson').update({ deleted_at: now }).in('id', lessonIds)
      softDeletedLessons = lessonIds.length
    }

    await db
      .from('lesson_subscription')
      .update({ deleted_at: now })
      .in('id', subIds)
  }

  // 5) Reset every current-quarter source sub's renewal_intent to 'renewing'
  const { data: resetRows } = await db
    .from('lesson_subscription')
    .update({ renewal_intent: 'renewing' })
    .eq('quarter_id', current.id)
    .is('deleted_at', null)
    .select('id')

  revalidatePath('/chia/lessons-events/renewal')
  revalidatePath('/chia/lessons-events/invoices')
  revalidatePath('/chia/lessons-events/subscriptions')
  revalidatePath('/chia/lessons-events')

  return {
    ok: true,
    voidedInvoices,
    deletedDrafts,
    softDeletedSubs: subIds.length,
    softDeletedLessons,
    resetIntents: resetRows?.length ?? 0,
  }
}

/**
 * Flip renewal_intent back to 'renewing'. Does NOT re-create pending subs —
 * admin must re-run Create Pending for that. Separating the two keeps the
 * undo predictable (no surprise lesson regeneration).
 */
export async function markRenewing(
  sourceSubscriptionId: string,
): Promise<{ error?: string }> {
  const db = createAdminClient()
  const { error } = await db
    .from('lesson_subscription')
    .update({ renewal_intent: 'renewing' })
    .eq('id', sourceSubscriptionId)

  if (error) return { error: error.message }

  revalidatePath('/chia/lessons-events/renewal')
  return {}
}
