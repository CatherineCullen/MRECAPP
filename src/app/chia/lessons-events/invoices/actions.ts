'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { stripe } from '@/lib/stripe/server'
import { createDraftInvoice } from '@/lib/stripe/invoice'
import { ensureStripeCustomer } from '@/lib/stripe/customer'
import { assertStripeOutboundAllowed } from '@/lib/outbound'
import { displayName } from '@/lib/displayName'

// Lesson-subscription invoicing.
//
// Simpler than the board track: no allocation grid, no per-item splits. One
// LessonSubscription = one line item. Grouped per billed_to person so a
// family with multiple kids (or a rider with two weekly slots) gets one
// bundled invoice — their call to bundle at the parent level.
//
// Lifecycle mirrors board:
//   generate → Drafts → Send (finalize + email) → Sent → webhook flips paid
//
// On invoice.paid, the existing webhook cascade (route.ts) flips each linked
// LessonSubscription pending → active and its pending lessons → scheduled.

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const h12 = h % 12 || 12
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Generate Stripe + CHIA drafts for every pending LessonSubscription in the
 * given quarter that isn't already attached to an invoice. One invoice per
 * billed_to person — so a household with two riders in a quarter gets one
 * invoice with multiple line items (one per subscription).
 *
 * Idempotent on re-run: subscriptions that already have an `invoice_id` set
 * are skipped. If a person has N pending subs with no invoice and M already
 * on invoices, only the N uncovered ones land on a new draft.
 *
 * Per-person isolation: a Stripe or DB failure for one person doesn't block
 * the rest. Returns per-person results so the UI can show partial success.
 */
export async function generateLessonSubscriptionInvoices(params: {
  quarterId: string
}): Promise<
  | { ok: true; results: Array<{ personId: string; personLabel: string; ok: boolean; stripeInvoiceId?: string; error?: string }> }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  // Load pending subs in the quarter with no invoice_id yet. Pull the fields
  // needed to build line item descriptions in one query.
  const { data: subs, error: subsErr } = await db
    .from('lesson_subscription')
    .select(`
      id, billed_to_id, rider_id, lesson_day, lesson_time, subscription_price,
      is_prorated, prorated_price, subscription_type,
      rider:person!lesson_subscription_rider_id_fkey      ( id, first_name, last_name, preferred_name ),
      instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name ),
      quarter:quarter                                     ( id, label, start_date, end_date )
    `)
    .eq('quarter_id', params.quarterId)
    .eq('status', 'pending')
    .is('invoice_id', null)
    .is('deleted_at', null)

  if (subsErr) return { ok: false, error: `Failed to load subscriptions: ${subsErr.message}` }
  if (!subs || subs.length === 0) return { ok: true, results: [] }

  const quarter = subs[0].quarter
  if (!quarter) return { ok: false, error: 'Subscription is missing a quarter link.' }

  // Group by billed_to. One invoice per billed_to across all their pending
  // subs — family gets one payment link.
  type Sub = typeof subs[number]
  const byPerson = new Map<string, Sub[]>()
  for (const s of subs) {
    const list = byPerson.get(s.billed_to_id) ?? []
    list.push(s)
    byPerson.set(s.billed_to_id, list)
  }

  const personIds = Array.from(byPerson.keys())
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)
  const labelFor = (id: string): string => {
    const p = persons?.find(x => x.id === id)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return displayName(p)
  }

  const results: Array<{ personId: string; personLabel: string; ok: boolean; stripeInvoiceId?: string; error?: string }> = []

  for (const [personId, personSubs] of byPerson) {
    try {
      // Build line items — one per sub. Prorated subs use their prorated_price
      // (could be a different amount per sub), the rest use subscription_price.
      const lineItems = personSubs.map(s => {
        const price = s.is_prorated && s.prorated_price != null
          ? Number(s.prorated_price)
          : Number(s.subscription_price)
        const riderName = displayName(s.rider)
        const instructorName = displayName(s.instructor)
        const slot = `${capitalize(s.lesson_day)} ${formatTime(s.lesson_time)}`
        const typeTag = s.subscription_type === 'boarder' ? ' · Boarder' : ''
        const prorateTag = s.is_prorated ? ' · Prorated' : ''
        return {
          description: `${quarter.label} Lessons — ${riderName} (${slot} with ${instructorName}${typeTag}${prorateTag})`,
          amount: price,
        }
      })

      const { stripeInvoiceId } = await createDraftInvoice({
        personId,
        lineItems,
        notes: `${quarter.label} Lesson Subscription`,
        daysUntilDue: 14, // lessons bill closer to start date than board
      })

      // Create the CHIA invoice row (draft) — use the quarter boundaries as
      // the billing period so the Sent view groups these with the quarter.
      const { data: invRow, error: invErr } = await db
        .from('invoice')
        .insert({
          billed_to_id:      personId,
          period_start:      quarter.start_date,
          period_end:        quarter.end_date,
          status:            'draft' as const,
          stripe_invoice_id: stripeInvoiceId,
          created_by:        user.personId ?? null,
        })
        .select('id')
        .single()

      if (invErr || !invRow) throw new Error(`invoice insert failed: ${invErr?.message ?? 'no row'}`)

      // One invoice_line_item per sub — link via lesson_subscription_id
      // (ADR-0010 source FK).
      const lineRows = personSubs.map(s => {
        const price = s.is_prorated && s.prorated_price != null
          ? Number(s.prorated_price)
          : Number(s.subscription_price)
        const riderName = displayName(s.rider)
        const instructorName = displayName(s.instructor)
        const slot = `${capitalize(s.lesson_day)} ${formatTime(s.lesson_time)}`
        const typeTag = s.subscription_type === 'boarder' ? ' · Boarder' : ''
        const prorateTag = s.is_prorated ? ' · Prorated' : ''
        return {
          invoice_id:             invRow.id,
          description:            `${quarter.label} Lessons — ${riderName} (${slot} with ${instructorName}${typeTag}${prorateTag})`,
          quantity:               1,
          unit_price:             price,
          is_credit:              false,
          is_admin_added:         false,
          line_item_type:         'standard' as const,
          lesson_subscription_id: s.id,
        }
      })

      const { error: lineErr } = await db.from('invoice_line_item').insert(lineRows)
      if (lineErr) throw new Error(`invoice_line_item insert failed: ${lineErr.message}`)

      // Link each sub back to the invoice — this is what the paid webhook
      // reads to find "which subs activate when this invoice gets paid."
      const { error: linkErr } = await db
        .from('lesson_subscription')
        .update({ invoice_id: invRow.id })
        .in('id', personSubs.map(s => s.id))

      if (linkErr) throw new Error(`subscription invoice_id link failed: ${linkErr.message}`)

      results.push({ personId, personLabel: labelFor(personId), ok: true, stripeInvoiceId })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generateLessonSubscriptionInvoices] failed for person', personId, msg)
      results.push({ personId, personLabel: labelFor(personId), ok: false, error: msg })
    }
  }

  revalidatePath('/chia/lessons-events/renewal')
  revalidatePath('/chia/lessons-events/invoices')
  return { ok: true, results }
}

/**
 * Send one lesson draft invoice. Same flow as board's sendDraftInvoice:
 * finalize + send on Stripe, flip status=sent/sent_at on CHIA. The webhook
 * will reconcile if Stripe status races ahead.
 */
export async function sendLessonDraftInvoice(params: {
  invoiceId: string
}): Promise<
  | { ok: true; stripeInvoiceId: string; hostedInvoiceUrl: string | null }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: inv, error: invErr } = await db
    .from('invoice')
    .select('id, status, stripe_invoice_id, deleted_at, billed_to_id')
    .eq('id', params.invoiceId)
    .single()

  if (invErr || !inv) return { ok: false, error: 'Invoice not found' }
  if (inv.deleted_at) return { ok: false, error: 'Invoice is deleted' }
  if (inv.status !== 'draft') return { ok: false, error: `Invoice is already ${inv.status}` }
  if (!inv.stripe_invoice_id) return { ok: false, error: 'Invoice has no Stripe link' }

  try {
    await ensureStripeCustomer(inv.billed_to_id)
  } catch (e) {
    console.error('[sendLessonDraftInvoice] customer sync failed', inv.billed_to_id, e)
  }

  // Kill switch: finalize+send is what causes Stripe to email the customer.
  // Gated in live mode via OUTBOUND_ENABLED; test mode passes through.
  let finalizedId: string
  try {
    assertStripeOutboundAllowed('stripe_invoice_finalize')
    const finalized = await stripe.invoices.finalizeInvoice(inv.stripe_invoice_id)
    if (!finalized.id) throw new Error('Stripe finalizeInvoice returned no id')
    finalizedId = finalized.id
  } catch (e) {
    return { ok: false, error: `Finalize failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  let hostedInvoiceUrl: string | null = null
  try {
    assertStripeOutboundAllowed('stripe_invoice_send')
    const sent = await stripe.invoices.sendInvoice(finalizedId)
    hostedInvoiceUrl = sent.hosted_invoice_url ?? null
  } catch (e) {
    return { ok: false, error: `Send failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const { error: updErr } = await db
    .from('invoice')
    .update({
      status:  'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', inv.id)

  if (updErr) {
    console.error('[sendLessonDraftInvoice] CHIA update failed after Stripe send', inv.id, updErr.message)
    return {
      ok: false,
      error: `Stripe sent, but CHIA status update failed: ${updErr.message}. Webhook will reconcile.`,
    }
  }

  revalidatePath('/chia/lessons-events/invoices')
  revalidatePath('/chia/lessons-events/renewal')
  return { ok: true, stripeInvoiceId: finalizedId, hostedInvoiceUrl }
}

/**
 * Discard a lesson draft invoice. Soft-deletes the CHIA invoice + its line
 * items, deletes the Stripe draft, and clears `invoice_id` on every linked
 * subscription so they return to the "pending, no invoice" state and re-
 * appear as generate candidates.
 *
 * No multi-invoice cascade needed here (unlike board): lesson invoices don't
 * share a source between people. One invoice = one household.
 */
export async function discardLessonDraftInvoice(params: {
  invoiceId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: inv, error: invErr } = await db
    .from('invoice')
    .select('id, status, stripe_invoice_id, deleted_at')
    .eq('id', params.invoiceId)
    .single()

  if (invErr || !inv) return { ok: false, error: 'Invoice not found' }
  if (inv.deleted_at) return { ok: false, error: 'Invoice is already deleted' }
  if (inv.status !== 'draft') return { ok: false, error: `Only drafts can be discarded (status: ${inv.status})` }

  // Clear the link from any subs that point at this invoice first — that way
  // if the soft-delete below fails midway, subs don't end up orphaned with an
  // invoice_id pointing at a deleted invoice.
  const { error: unlinkErr } = await db
    .from('lesson_subscription')
    .update({ invoice_id: null })
    .eq('invoice_id', inv.id)

  if (unlinkErr) return { ok: false, error: `Unlink subs failed: ${unlinkErr.message}` }

  // Best-effort Stripe delete (drafts only, so del() is correct — void is for
  // finalized invoices which we don't have here).
  if (inv.stripe_invoice_id) {
    try {
      await stripe.invoices.del(inv.stripe_invoice_id)
    } catch (e) {
      console.warn('[discardLessonDraftInvoice] stripe delete warning', inv.stripe_invoice_id, e)
    }
  }

  const now = new Date().toISOString()

  const { error: delLinesErr } = await db
    .from('invoice_line_item')
    .update({ deleted_at: now })
    .eq('invoice_id', inv.id)
    .is('deleted_at', null)

  if (delLinesErr) return { ok: false, error: `Soft-delete lines failed: ${delLinesErr.message}` }

  const { error: delInvErr } = await db
    .from('invoice')
    .update({ deleted_at: now })
    .eq('id', inv.id)

  if (delInvErr) return { ok: false, error: `Soft-delete invoice failed: ${delInvErr.message}` }

  revalidatePath('/chia/lessons-events/invoices')
  revalidatePath('/chia/lessons-events/renewal')
  return { ok: true }
}

/**
 * Void & Cancel — the escape hatch for a sent-but-unpaid lesson invoice when
 * the rider says "actually we're out for next quarter." Voids the Stripe
 * invoice, soft-deletes the linked pending LessonSubscriptions (and their
 * pending lessons), and marks the source subscription's renewal_intent as
 * not_renewing so it shows in the Not Renewing section of the Renewal tab.
 *
 * Why bundled: admin asked for a single action that makes the slot fully
 * gone in one click — no orphan rows, no stray calendar entries, no manual
 * hunting through sub lists.
 *
 * Only sent/overdue invoices are eligible. Paid invoices are not voidable
 * here (use Stripe refund flow in the dashboard). Draft invoices use
 * discardLessonDraftInvoice instead.
 */
export async function voidAndCancelLessonInvoice(params: {
  invoiceId: string
}): Promise<{ ok: true; voidedSubs: number; cancelledLessons: number } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: inv, error: invErr } = await db
    .from('invoice')
    .select('id, status, stripe_invoice_id, deleted_at')
    .eq('id', params.invoiceId)
    .single()

  if (invErr || !inv) return { ok: false, error: 'Invoice not found' }
  if (inv.deleted_at) return { ok: false, error: 'Invoice is already deleted' }
  if (inv.status === 'paid') {
    return { ok: false, error: 'Paid invoices can\'t be voided here — use Stripe to refund.' }
  }
  if (inv.status === 'draft') {
    return { ok: false, error: 'Use Discard on draft invoices.' }
  }
  if (inv.status === 'voided') {
    return { ok: false, error: 'Already voided.' }
  }

  // Find the linked subscriptions — only pending ones are in scope. A sub
  // that's already active (shouldn't happen on a non-paid invoice, but guard)
  // would mean lessons are already live; we don't touch those.
  //
  // We intentionally INCLUDE soft-deleted subs here: if admin hit Not Renewing
  // on the source (which soft-deletes the pending sub) and then wants to
  // clean up the orphan invoice via Void & Cancel, the cascade should still
  // run — otherwise the source sub's renewal_intent stays stale and the row
  // re-appears as "ready to clone" on the Renewal tab.
  const { data: subs, error: subsErr } = await db
    .from('lesson_subscription')
    .select(`
      id, rider_id, status,
      rider:person!lesson_subscription_rider_id_fkey ( first_name, last_name, preferred_name ),
      lesson_day, lesson_time, instructor_id,
      quarter:quarter ( start_date )
    `)
    .eq('invoice_id', inv.id)
    .eq('status', 'pending')

  if (subsErr) return { ok: false, error: `Load subs failed: ${subsErr.message}` }

  // Void the Stripe invoice first. If Stripe says it's already voided, treat
  // that as success and continue the cascade — we may be retrying after a
  // partial failure (e.g. earlier Not Renewing soft-deleted the pending sub,
  // the old void code skipped the cleanup, now we need to finish it without
  // re-voiding). Any *other* Stripe failure still aborts.
  if (inv.stripe_invoice_id) {
    try {
      await stripe.invoices.voidInvoice(inv.stripe_invoice_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const alreadyVoided =
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('void')
      if (!alreadyVoided) {
        return { ok: false, error: `Stripe void failed: ${msg}` }
      }
      console.warn('[voidAndCancelLessonInvoice] Stripe already-voided, continuing cascade', inv.stripe_invoice_id, msg)
    }
  }

  const now = new Date().toISOString()

  let cancelledLessons = 0
  for (const s of subs ?? []) {
    const { data: links } = await db
      .from('lesson_rider')
      .select('lesson_id, lesson:lesson(id, status)')
      .eq('subscription_id', s.id)
      .is('deleted_at', null)

    const pendingLessonIds = (links ?? [])
      .filter(l => l.lesson?.status === 'pending')
      .map(l => l.lesson_id)

    if (pendingLessonIds.length > 0) {
      await db.from('lesson').update({ deleted_at: now }).in('id', pendingLessonIds)
      cancelledLessons += pendingLessonIds.length
    }

    await db.from('lesson_subscription').update({ deleted_at: now }).eq('id', s.id)

    // Mark the previous-quarter source sub as not_renewing so the Renewal
    // tab reflects it. Match by (rider, day, time, instructor) in the
    // quarter immediately before this one.
    if (s.quarter?.start_date) {
      const { data: prevQuarter } = await db
        .from('quarter')
        .select('id')
        .is('deleted_at', null)
        .lt('start_date', s.quarter.start_date)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (prevQuarter) {
        await db
          .from('lesson_subscription')
          .update({ renewal_intent: 'not_renewing' })
          .eq('rider_id', s.rider_id)
          .eq('lesson_day', s.lesson_day)
          .eq('lesson_time', s.lesson_time)
          .eq('instructor_id', s.instructor_id)
          .eq('quarter_id', prevQuarter.id)
          .is('deleted_at', null)
      }
    }
  }

  // Flip invoice status to 'voided'. We keep the row (and its line items) so
  // the Sent view can surface it as a visible audit entry — grayed, grouped
  // under a "Voided" section — instead of having it silently vanish.
  await db
    .from('invoice')
    .update({ status: 'voided' })
    .eq('id', inv.id)

  revalidatePath('/chia/lessons-events/invoices')
  revalidatePath('/chia/lessons-events/renewal')
  revalidatePath('/chia/lessons-events')
  return { ok: true, voidedSubs: subs?.length ?? 0, cancelledLessons }
}
