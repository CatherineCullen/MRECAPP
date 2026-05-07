import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  NmiSignatureError,
  normalizeNmiEvent,
  verifyNmiWebhook,
  type NormalizedNmiEvent,
} from '@/lib/payments/nmi/webhook'

/**
 * NMI webhook receiver. Configured in the NMI Merchant Portal under
 * Settings → Webhooks; the URL is `https://mrecapp.com/api/webhooks/nmi`
 * once production cuts over. Sandbox testing today posts to a
 * webhook.site listener; the actual endpoint URL gets registered in
 * the merchant portal at NMI cutover (see ADR-0021's TouchSuite
 * handoff checklist).
 *
 * Verified payload shape from the 2026-05-07 sandbox probe (full
 * details in `src/lib/payments/nmi/webhook.ts`):
 *   - JSON body, not form-encoded (different from outbound API calls)
 *   - signature header `webhook-signature: t=<unix>,s=<hex_hmac>`
 *   - event_type one of `transaction.sale.success` / `.failure` / etc
 *   - event_body.order_id == our chia invoice id (we stamp `orderid`
 *     on add_invoice in createAndSendInvoice)
 *   - event_body.transaction_id == NMI's payment id (separate)
 *   - features.is_test_mode === true for sandbox events; we reject
 *     test events in production
 *
 * Idempotency: we guard against double-processing by checking the
 * invoice's current status before applying the cascade — once an
 * invoice is `paid`, repeated success events no-op. This is sufficient
 * for the Phase 1 lattice; if NMI ever retries delivery aggressively
 * we can add a `processed_webhook_event` table later.
 *
 * Response window: NMI documents a 2-second ACK timeout. We do the DB
 * cascade synchronously since it's bounded (one invoice + N
 * lesson_months + M lessons) and Supabase round-trip is well under a
 * second. If this ever gets tight, we can return 200 immediately and
 * push the work to a background task.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const rawBody   = await request.text()
  const signature = request.headers.get('webhook-signature')

  let normalized: NormalizedNmiEvent
  try {
    const event = verifyNmiWebhook(rawBody, signature)
    normalized = normalizeNmiEvent(event)
  } catch (e) {
    if (e instanceof NmiSignatureError) {
      console.error('[nmi webhook] signature verification failed:', e.message)
      return new Response(`Signature verification failed: ${e.message}`, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nmi webhook] body parse failed:', msg)
    return new Response(`Bad request: ${msg}`, { status: 400 })
  }

  // Production safety: NMI sandbox stamps `features.is_test_mode = true`
  // on every event. If a sandbox key/postback URL ever leaks into the
  // production environment, we don't want sandbox payments to mark real
  // invoices as paid.
  if (process.env.NODE_ENV === 'production' && normalized.kind !== 'unknown' && normalized.isTestMode) {
    console.warn(
      '[nmi webhook] received test-mode event in production; ignoring',
      normalized.eventId,
    )
    return new Response('Test event ignored', { status: 200 })
  }

  try {
    switch (normalized.kind) {
      case 'invoice_paid':
        await handleInvoicePaid(normalized)
        break
      case 'invoice_payment_failed':
        // Don't downgrade invoice status — NMI will retry on its end and
        // a later success event should land. Just log so it's visible
        // for admin debugging.
        console.log(
          '[nmi webhook] payment failed for invoice',
          normalized.chiaInvoiceId,
          'event_id:', normalized.eventId,
        )
        break
      case 'unknown':
        // Out-of-band sales (admin charged a card directly in the NMI
        // portal, etc.) and event types we don't yet handle land here.
        console.log(
          '[nmi webhook] unhandled event type',
          normalized.eventType,
          'event_id:', normalized.eventId,
        )
        break
    }
  } catch (e) {
    // Don't let handler errors return 500 to NMI — they retry on 5xx and
    // we don't want a poison-pill event blocking the queue. Log loudly
    // and acknowledge.
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nmi webhook] handler error for event', normalized.eventId, msg)
  }

  return new Response('OK', { status: 200 })
}

/**
 * `transaction.sale.success` cascade — flip invoice + downstream
 * lesson_month + lesson rows to their paid/scheduled equivalents.
 */
async function handleInvoicePaid(
  event: Extract<NormalizedNmiEvent, { kind: 'invoice_paid' }>,
): Promise<void> {
  const supabase = createAdminClient()

  // 1. Look up the invoice by id (we stamped chia_invoice.id as orderid
  //    on add_invoice — see PR 2's createAndSendInvoice). `invoice.total`
  //    is computed from line items, so we pull line item totals and sum.
  const { data: invoice, error: lookupErr } = await supabase
    .from('invoice')
    .select('id, status, nmi_invoice_id, nmi_transaction_id, invoice_line_item(total)')
    .eq('id', event.chiaInvoiceId)
    .maybeSingle()

  if (lookupErr) {
    throw new Error(`Failed to look up invoice ${event.chiaInvoiceId}: ${lookupErr.message}`)
  }
  if (!invoice) {
    // Out-of-band sale — payment landed but it doesn't map to a CHIA
    // invoice. Log and ignore. This is normal for transactions created
    // directly in the NMI portal.
    console.log(
      '[nmi webhook] no invoice found for order_id',
      event.chiaInvoiceId,
      'transaction_id:', event.nmiTransactionId,
    )
    return
  }

  // 2. Idempotency guard: if the invoice is already paid, no-op.
  //    Sufficient for Phase 1; replace with an event_id audit table
  //    later if we ever see real duplicate-delivery issues.
  if (invoice.status === 'paid') {
    return
  }

  // 3. Defense against tampering / mismatched events: invoice total
  //    must match what NMI says was paid. Disagreement is a strong
  //    signal that something has gone wrong — log and refuse to flip
  //    rather than mark an invoice paid for the wrong amount.
  const expected = (invoice.invoice_line_item ?? []).reduce(
    (sum, li) => sum + Number(li.total ?? 0),
    0,
  )
  if (Math.abs(expected - event.amount) > 0.01) {
    throw new Error(
      `Invoice ${event.chiaInvoiceId} total ${expected} does not match webhook amount ${event.amount} — refusing to mark paid`,
    )
  }

  const nowIso = new Date().toISOString()

  // 4. Update the invoice. Stamp paid_at, paid_method (derived from
  //    NMI's transaction_type), nmi_transaction_id, and status.
  const paidMethod = derivePaidMethod(event.raw)

  const { error: updateErr } = await supabase
    .from('invoice')
    .update({
      status:             'paid',
      paid_at:            nowIso,
      paid_method:        paidMethod,
      nmi_transaction_id: event.nmiTransactionId,
    })
    .eq('id', invoice.id)

  if (updateErr) {
    throw new Error(`Failed to update invoice ${invoice.id}: ${updateErr.message}`)
  }

  // 5. Cascade: any lesson_month rows linked to this invoice flip
  //    Pending/Invoiced → Paid.
  const { data: paidMonths, error: monthsErr } = await supabase
    .from('lesson_month')
    .update({ status: 'Paid' })
    .eq('invoice_id', invoice.id)
    .is('deleted_at', null)
    .select('id')

  if (monthsErr) {
    throw new Error(`Failed to update lesson_month rows for invoice ${invoice.id}: ${monthsErr.message}`)
  }

  // 6. Cascade onward: lesson rows under those months flip
  //    pending → scheduled. This is what makes the lessons actually
  //    show up confirmed on the rider's My Schedule.
  if (paidMonths && paidMonths.length > 0) {
    const monthIds = paidMonths.map((m) => m.id)
    const { error: lessonsErr } = await supabase
      .from('lesson')
      .update({ status: 'scheduled' })
      .in('month_id', monthIds)
      .eq('status', 'pending')
      .is('deleted_at', null)

    if (lessonsErr) {
      throw new Error(
        `Failed to flip lessons to scheduled for invoice ${invoice.id}: ${lessonsErr.message}`,
      )
    }
  }
}

/**
 * Map NMI's transaction_type field to the paid_method label we already
 * use in the invoice row. Stripe-era values were 'card', 'us_bank_account',
 * 'link', 'out_of_band'; we keep the same vocabulary for continuity in
 * the Sent-invoices UI.
 *
 * `event_body.transaction_type` is typed as `unknown` because of the
 * `NmiWebhookEvent` index signature — coerce explicitly here.
 */
function derivePaidMethod(raw: { event_body?: Record<string, unknown> }): string {
  const txType = raw.event_body?.transaction_type
  if (txType === 'cc')    return 'card'
  if (txType === 'check') return 'ach'
  return typeof txType === 'string' ? txType : 'unknown'
}
