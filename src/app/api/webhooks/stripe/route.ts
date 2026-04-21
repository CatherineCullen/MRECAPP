import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

type InvoiceStatus = Database['public']['Enums']['invoice_status']

// Stripe webhook endpoint.
//
// Phase 1 skeleton: verify signature, log event, return 200. Handlers for
// invoice.paid / invoice.finalized / invoice.payment_failed / etc. land
// in Phase B when we actually generate invoices.
//
// Must be a raw body handler — Stripe's signature is computed against the
// exact bytes sent, so we use request.text() (not .json()).
//
// Register this URL in the Stripe Dashboard → Developers → Webhooks, and
// copy the signing secret into STRIPE_WEBHOOK_SECRET in .env.local.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signingSecret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not configured')
    return new Response('Webhook not configured', { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, signingSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe webhook] signature verification failed:', message)
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 })
  }

  // Phase 1: log and acknowledge. Phase B fills these in.
  console.log('[stripe webhook] received', event.type, event.id)

  switch (event.type) {
    case 'invoice.finalized':
    case 'invoice.sent':
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
      await handleInvoiceEvent(event)
      break

    case 'customer.created':
    case 'customer.updated':
    case 'customer.deleted':
      // TODO Phase B (or Phase 2 for deleted): reverse-sync from Stripe
      // using metadata.chia_person_id.
      break

    default:
      // Unhandled event types are still ack'd with 200 so Stripe doesn't retry.
      break
  }

  return Response.json({ received: true })
}

/**
 * Reflect Stripe invoice events back into our DB. We use stripe_invoice_id
 * to find the mirror row (set when the invoice was created — see
 * createAndSendInvoice in lib/stripe/invoice.ts).
 *
 * Status mapping — the Stripe event type determines the target status.
 * We only UPDATE, never INSERT, because every invoice we care about is
 * created by CHIA first, then handed to Stripe. If a row isn't found, the
 * invoice was created outside CHIA (e.g., directly in the dashboard for
 * testing) and we log + skip rather than inventing a row with no
 * billed_to_id.
 *
 * Idempotency: all webhook deliveries are retryable. Setting the same
 * status and timestamps twice is harmless.
 */
async function handleInvoiceEvent(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  if (!invoice.id) return

  const db = createAdminClient()

  const { data: chiaInvoice } = await db
    .from('invoice')
    .select('id, status, paid_at')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle()

  if (!chiaInvoice) {
    console.log(
      `[stripe webhook] ${event.type} for stripe invoice ${invoice.id} — no CHIA row, skipping`
    )
    return
  }

  const update: {
    status?: InvoiceStatus
    paid_at?: string | null
    sent_at?: string | null
    paid_method?: string | null
    hosted_invoice_url?: string | null
  } = {}

  // Keep hosted_invoice_url fresh — Stripe occasionally regenerates it, and
  // the customer-facing /my/invoices page renders a "Pay now" button off it.
  if (invoice.hosted_invoice_url) {
    update.hosted_invoice_url = invoice.hosted_invoice_url
  }

  switch (event.type) {
    case 'invoice.finalized':
      // Finalized but not yet sent via email — still 'draft' from Stripe's
      // perspective of collection. Our flow finalizes + sends together,
      // so in practice this arrives essentially simultaneously with 'sent'.
      // Don't overwrite a more advanced status.
      if (chiaInvoice.status === 'draft' || chiaInvoice.status === 'pending_review') {
        update.status = 'sent'
      }
      break

    case 'invoice.sent':
      if (
        chiaInvoice.status === 'draft' ||
        chiaInvoice.status === 'pending_review'
      ) {
        update.status = 'sent'
      }
      // Keep sent_at fresh but never clobber once paid — paid > sent in
      // our state lattice.
      if (chiaInvoice.status !== 'paid') {
        const finalizedAt = invoice.status_transitions.finalized_at
        if (finalizedAt) {
          update.sent_at = new Date(finalizedAt * 1000).toISOString()
        }
      }
      break

    case 'invoice.paid':
      update.status = 'paid'
      update.paid_at = invoice.status_transitions.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString()
      update.paid_method = await resolvePaidMethod(invoice)
      // After the invoice row itself is updated (below), cascade any linked
      // lesson subscriptions: pending → active, pending lessons → scheduled.
      // This is what lets a paid quarterly-renewal invoice actually make a
      // rider's slots appear in their My Schedule view.
      break

    case 'invoice.payment_failed':
      // Stripe keeps the invoice in 'open' state on failure; a retry or a
      // new payment method can still succeed. We reflect it as 'overdue'
      // only if past due_date — otherwise leave 'sent'. Phase 1 simple
      // rule: don't downgrade.
      break

    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
      // No enum value for 'voided' in invoice_status; treat as overdue for
      // visibility and let admin decide follow-up. Phase 2 may add explicit
      // enum values.
      update.status = 'overdue'
      break
  }

  if (Object.keys(update).length === 0) return

  const { error } = await db.from('invoice').update(update).eq('id', chiaInvoice.id)
  if (error) {
    console.error(
      `[stripe webhook] failed to update invoice ${chiaInvoice.id}: ${error.message}`
    )
    // Returning normally (200) so Stripe doesn't retry a DB error that
    // won't fix itself. Admin can trigger manual reconciliation later.
  } else {
    console.log(
      `[stripe webhook] ${event.type} → invoice ${chiaInvoice.id} updated`,
      update
    )
  }

  // Cross-domain cascade: if this event means the invoice is now paid,
  // activate any lesson subscriptions tied to it.
  if (event.type === 'invoice.paid') {
    await activateSubscriptionsForInvoice(db, chiaInvoice.id)
  }
}

/**
 * When a Stripe invoice gets paid, find any LessonSubscriptions pointed at
 * the CHIA invoice row and flip:
 *   - subscription status: pending → active
 *   - its pending lessons: pending → scheduled
 *
 * Why gate on lesson.status = 'pending': if admin manually marked a lesson
 * as cancelled/completed somehow between invoice-send and invoice-paid, we
 * don't want to resurrect it. Webhook is idempotent — running this twice
 * against an already-active sub is a no-op (the WHERE clause filters out
 * non-pending rows).
 */
async function activateSubscriptionsForInvoice(
  db: ReturnType<typeof createAdminClient>,
  chiaInvoiceId: string,
): Promise<void> {
  const { data: subs, error: subsErr } = await db
    .from('lesson_subscription')
    .select('id')
    .eq('invoice_id', chiaInvoiceId)
    .eq('status', 'pending')
    .is('deleted_at', null)

  if (subsErr) {
    console.error('[stripe webhook] activate lookup failed:', subsErr.message)
    return
  }
  if (!subs || subs.length === 0) return

  const subIds = subs.map(s => s.id)

  // Flip the subs themselves
  const { error: subUpdateErr } = await db
    .from('lesson_subscription')
    .update({ status: 'active' })
    .in('id', subIds)

  if (subUpdateErr) {
    console.error('[stripe webhook] subscription activate failed:', subUpdateErr.message)
    return
  }

  // Find the pending lessons tied to these subs via lesson_rider
  const { data: links } = await db
    .from('lesson_rider')
    .select('lesson_id, lesson:lesson(id, status)')
    .in('subscription_id', subIds)
    .is('deleted_at', null)

  const pendingLessonIds = (links ?? [])
    .filter(l => l.lesson?.status === 'pending')
    .map(l => l.lesson_id)

  if (pendingLessonIds.length > 0) {
    const { error: lessonErr } = await db
      .from('lesson')
      .update({ status: 'scheduled' })
      .in('id', pendingLessonIds)
      .eq('status', 'pending') // extra safety — don't flip anything else

    if (lessonErr) {
      console.error('[stripe webhook] lesson scheduled flip failed:', lessonErr.message)
      return
    }
  }

  console.log(
    `[stripe webhook] activated ${subIds.length} subscription(s), scheduled ${pendingLessonIds.length} lesson(s) for invoice ${chiaInvoiceId}`,
  )
}

/**
 * Extract a human-readable payment method from a paid invoice.
 *
 * Three cases worth distinguishing:
 *  - Paid out of band (admin marked paid in Stripe dashboard) → 'out_of_band'
 *  - Paid online → the charge's payment_method_details.type ('card',
 *    'us_bank_account', 'link', etc.)
 *  - Unclear → null (display will just show '—')
 *
 * Best-effort: any Stripe error falls back to null rather than blocking
 * the webhook. Display-only field.
 */
async function resolvePaidMethod(invoice: Stripe.Invoice): Promise<string | null> {
  // SDK types for these two fields differ by version; cast narrowly.
  const extras = invoice as Stripe.Invoice & {
    paid_out_of_band?: boolean
    latest_charge?: string | Stripe.Charge | null
  }
  if (extras.paid_out_of_band) return 'out_of_band'
  const chargeRef = extras.latest_charge
  if (!chargeRef) return null
  try {
    const charge = typeof chargeRef === 'string'
      ? await stripe.charges.retrieve(chargeRef)
      : chargeRef
    return charge.payment_method_details?.type ?? null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[stripe webhook] paid_method resolve failed', msg)
    return null
  }
}
