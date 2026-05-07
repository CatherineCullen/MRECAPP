import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Shared "invoice was paid" cascade — used by both:
 *   - The NMI webhook handler (`/api/webhooks/nmi`) on
 *     `transaction.sale.success`
 *   - The manual mark-paid action invoked from the invoice detail page
 *     when admin records cash, check, external NMI charge, etc
 *
 * Keeping the cascade in one place is load-bearing: webhook and manual
 * paths MUST flip status the same way, or admin sees inconsistent
 * lesson schedules depending on how the invoice settled. Diverging
 * implementations are a known regression hazard.
 *
 * Idempotent: if the invoice is already 'paid', no-op silently. Both
 * callers exercise this path (NMI may double-deliver an event; admin
 * may double-click).
 *
 * Cascade scope:
 *   1. Update `invoice` row → status='paid', stamp paid_at + paid_method
 *      + (optional) nmi_transaction_id
 *   2. Flip linked `lesson_month` rows → 'Paid'
 *   3. Flip lessons under those months → 'scheduled' (the visible
 *      consequence on rider My Schedule)
 *
 * Doesn't touch lesson_packages or events; those still use their own
 * `invoice_id` linkage but their own state machines don't gate on
 * invoice-paid status the way subscriptions do.
 */

type DB = SupabaseClient<Database>

export type ApplyInvoicePaidArgs = {
  db:           DB
  invoiceId:    string
  /** What we record on the invoice for the audit trail. */
  paidMethod:   string
  /**
   * Optional NMI transaction id (set by the webhook path). Manual
   * payments leave this undefined.
   */
  nmiTransactionId?: string
}

export type ApplyInvoicePaidResult =
  | { ok: true; alreadyPaid: false; lessonMonthsFlipped: number; lessonsFlipped: number }
  | { ok: true; alreadyPaid: true }
  | { ok: false; error: string }

export async function applyInvoicePaid(args: ApplyInvoicePaidArgs): Promise<ApplyInvoicePaidResult> {
  const { db, invoiceId, paidMethod, nmiTransactionId } = args

  // Idempotency check — if already paid, no-op (don't double-flip
  // lessons or overwrite paid_at).
  const { data: invoice, error: lookupErr } = await db
    .from('invoice')
    .select('id, status, deleted_at')
    .eq('id', invoiceId)
    .maybeSingle()

  if (lookupErr) return { ok: false, error: `Invoice lookup failed: ${lookupErr.message}` }
  if (!invoice)  return { ok: false, error: 'Invoice not found' }
  if (invoice.deleted_at) return { ok: false, error: 'Invoice is deleted' }
  if (invoice.status === 'paid') return { ok: true, alreadyPaid: true }

  const nowIso = new Date().toISOString()

  // 1. Flip the invoice. Stamp paid_at, paid_method, and
  //    (when present) nmi_transaction_id.
  const updatePayload: {
    status:               'paid'
    paid_at:              string
    paid_method:          string
    nmi_transaction_id?:  string
  } = {
    status:      'paid',
    paid_at:     nowIso,
    paid_method: paidMethod,
  }
  if (nmiTransactionId) updatePayload.nmi_transaction_id = nmiTransactionId

  const { error: invUpdErr } = await db
    .from('invoice')
    .update(updatePayload)
    .eq('id', invoice.id)

  if (invUpdErr) {
    return { ok: false, error: `Failed to update invoice: ${invUpdErr.message}` }
  }

  // 2. Cascade: lesson_month rows linked to this invoice flip to Paid.
  const { data: paidMonths, error: monthsErr } = await db
    .from('lesson_month')
    .update({ status: 'Paid' })
    .eq('invoice_id', invoice.id)
    .is('deleted_at', null)
    .select('id')

  if (monthsErr) {
    return { ok: false, error: `Failed to update lesson_month rows: ${monthsErr.message}` }
  }

  // 3. Cascade onward: lessons under those months flip pending → scheduled.
  let lessonsFlipped = 0
  if (paidMonths && paidMonths.length > 0) {
    const monthIds = paidMonths.map((m) => m.id)
    const { data: flippedLessons, error: lessonsErr } = await db
      .from('lesson')
      .update({ status: 'scheduled' })
      .in('month_id', monthIds)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .select('id')

    if (lessonsErr) {
      return { ok: false, error: `Failed to flip lessons to scheduled: ${lessonsErr.message}` }
    }
    lessonsFlipped = flippedLessons?.length ?? 0
  }

  return {
    ok:                  true,
    alreadyPaid:         false,
    lessonMonthsFlipped: paidMonths?.length ?? 0,
    lessonsFlipped,
  }
}
