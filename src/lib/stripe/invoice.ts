import 'server-only'
import { stripe } from './server'
import { ensureStripeCustomer } from './customer'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Thin wrappers around Stripe Invoicing for CHIA's billing pipeline.
 *
 * Core flow (matches Stripe's invoice lifecycle):
 *   1. create()        — Stripe draft invoice for a Customer
 *   2. addLineItem()   — attach one or more line items
 *   3. finalize()      — lock the invoice; no more edits; becomes payable
 *   4. send()          — email the hosted invoice link to the customer
 *   5. webhook events  — invoice.paid, invoice.payment_failed → update DB
 *
 * We mirror each Stripe invoice as a row in our own `invoice` table via
 * `stripe_invoice_id`. The DB row is the source of truth for CHIA features
 * (dashboards, line-item source FKs per ADR-0010, allocations per ADR-0014);
 * Stripe is the source of truth for payment state, which flows back via
 * webhooks.
 *
 * Money: Stripe takes amounts in integer cents (USD). Our DB stores dollars
 * as numeric. `toStripeAmount` is the one conversion point — keep it here.
 */

export function toStripeAmount(dollars: number): number {
  // Round to avoid floating-point pennies. Stripe rejects fractional cents.
  return Math.round(dollars * 100)
}

export function fromStripeAmount(cents: number): number {
  return cents / 100
}

export type LineItemInput = {
  description: string
  /** Dollars, not cents — converted inside. */
  unitPrice: number
  quantity: number
  /**
   * Source FKs per ADR-0010. At most one should be set — the billing source
   * this line item was generated from. Omit for true ad-hoc entries.
   * We don't enforce "exactly one" in code because the schema doesn't
   * either (no CHECK constraint); the ADR is a convention for builders.
   */
  lessonPackageId?: string
  lessonSubscriptionId?: string
  campEnrollmentId?: string
  boardServiceLogId?: string
  eventId?: string
  horseId?: string
}

/**
 * Create a finalized, sent Stripe invoice for a Person from a list of line
 * items, and mirror it as a row in our `invoice` table.
 *
 * Phase B: "ad-hoc invoice" path — no link to lesson_subscription /
 * lesson_package / board_service_log yet. InvoiceLineItems have all their
 * source FKs NULL. Phase C+ will add the domain-specific builders that
 * populate those FKs (ADR-0010 explicit nullable FKs).
 *
 * Returns the stripe invoice id and hosted invoice URL for the admin UI
 * to show / link to.
 */
export async function createAndSendInvoice(params: {
  personId: string
  lineItems: LineItemInput[]
  notes?: string
  daysUntilDue?: number
}): Promise<{ stripeInvoiceId: string; hostedInvoiceUrl: string | null; chiaInvoiceId: string }> {
  const { personId, lineItems, notes, daysUntilDue = 30 } = params

  if (lineItems.length === 0) {
    throw new Error('Cannot create an invoice with no line items')
  }

  const db = createAdminClient()
  const stripeCustomerId = await ensureStripeCustomer(personId)

  // Stripe flow: create invoice items (unattached to an invoice), then create
  // the invoice (which auto-pulls any pending items for that customer), then
  // finalize, then send.
  //
  // This order (items first) is the recommended pattern for Stripe Invoicing
  // when you know all items up-front — it avoids a race where finalize could
  // pick up items that haven't landed yet.

  // 1. Create pending invoice items attached to the Customer. When we call
  //    invoices.create() with pending_invoice_items_behavior: 'include'
  //    below, all the customer's unattached items get pulled into the new
  //    invoice automatically.
  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      amount: toStripeAmount(item.unitPrice * item.quantity),
      currency: 'usd',
      description:
        item.quantity > 1
          ? `${item.description} (${item.quantity} × $${item.unitPrice.toFixed(2)})`
          : item.description,
      metadata: {
        chia_person_id: personId,
      },
    })
  }

  // 2. Create the draft invoice. `pending_invoice_items_behavior: 'include'`
  //    pulls in all the items we just created for this customer.
  const stripeInvoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    description: notes,
    auto_advance: false, // we drive finalize/send explicitly
    pending_invoice_items_behavior: 'include',
    metadata: {
      chia_person_id: personId,
    },
  })

  if (!stripeInvoice.id) {
    throw new Error('Stripe returned an invoice with no id')
  }

  // 3. Finalize — locks the invoice and assigns a permanent number.
  const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id)
  if (!finalized.id) {
    throw new Error('Stripe finalizeInvoice returned no id')
  }

  // 4. Send — emails the hosted invoice link to the Customer's email.
  const sent = await stripe.invoices.sendInvoice(finalized.id)

  // 5. Mirror to our DB. One invoice row + one invoice_line_item row per input.
  //    ADR-0010: source FKs all NULL for ad-hoc invoices; Phase C+ populates
  //    them per billing source. Invoice total is derived from line items'
  //    generated `total` column — no `total_amount` on the invoice row.
  const today = new Date().toISOString().slice(0, 10)

  const { data: chiaInvoice, error: insertErr } = await db
    .from('invoice')
    .insert({
      billed_to_id: personId,
      period_start: today,
      period_end: today,
      status: 'sent',
      due_date: new Date(Date.now() + daysUntilDue * 86400_000).toISOString().slice(0, 10),
      stripe_invoice_id: finalized.id,
      notes: notes ?? null,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertErr || !chiaInvoice) {
    // The Stripe invoice is already sent — can't un-send it. Log loudly so
    // the admin can manually reconcile. This should be rare (DB availability
    // problem); we don't want to silently drop the link to Stripe.
    console.error(
      '[stripe invoice] DB mirror failed for stripe invoice',
      finalized.id,
      insertErr?.message
    )
    throw new Error(
      `Stripe invoice ${finalized.id} was sent but DB mirror failed: ${insertErr?.message}. Manual reconciliation required.`
    )
  }

  // Line items. Source FKs (ADR-0010) are passed through when the caller
  // supplies them — ad-hoc callers leave them undefined and all FKs stay null.
  const rows = lineItems.map((it) => ({
    invoice_id: chiaInvoice.id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    is_credit: false,
    // Admin-added only when there's no source FK — otherwise this row was
    // produced by a domain builder, not hand-typed by an admin.
    is_admin_added:
      !it.lessonPackageId &&
      !it.lessonSubscriptionId &&
      !it.campEnrollmentId &&
      !it.boardServiceLogId &&
      !it.eventId,
    line_item_type: 'standard' as const,
    horse_id: it.horseId ?? null,
    lesson_package_id: it.lessonPackageId ?? null,
    lesson_subscription_id: it.lessonSubscriptionId ?? null,
    camp_enrollment_id: it.campEnrollmentId ?? null,
    board_service_log_id: it.boardServiceLogId ?? null,
    event_id: it.eventId ?? null,
  }))
  const { error: lineErr } = await db.from('invoice_line_item').insert(rows)
  if (lineErr) {
    console.error('[stripe invoice] DB line-item mirror failed', lineErr.message)
    // Same as above: Stripe side is done, just surface the problem.
    throw new Error(`Stripe invoice sent but line-item mirror failed: ${lineErr.message}`)
  }

  return {
    stripeInvoiceId: finalized.id,
    hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
    chiaInvoiceId: chiaInvoice.id,
  }
}

/**
 * Create a **draft** Stripe invoice for a Person with line items attached,
 * without finalizing or sending. Used by the Boarding monthly-generation
 * flow: admin generates drafts for all boarders on ~25th, then reviews
 * them in a second step, then batch-sends. Between generate and send, the
 * admin can still poke at the drafts or void any that are wrong.
 *
 * We don't mirror to the `invoice` table here — the caller does that with
 * full knowledge of the source FKs (billing_line_item_allocation_id et al.)
 * per ADR-0010. This helper just owns the Stripe side.
 *
 * Returns the stripe invoice id for the caller to persist.
 */
export async function createDraftInvoice(params: {
  personId: string
  lineItems: Array<{
    description: string
    /** Dollars. The per-allocation amount, billed as a single line (qty 1). */
    amount: number
  }>
  notes?: string
  daysUntilDue?: number
}): Promise<{ stripeInvoiceId: string; stripeCustomerId: string }> {
  const { personId, lineItems, notes, daysUntilDue = 30 } = params

  if (lineItems.length === 0) {
    throw new Error('Cannot create an invoice with no line items')
  }

  const stripeCustomerId = await ensureStripeCustomer(personId)

  // Same pattern as createAndSendInvoice: pending items first, then
  // invoice.create with pending_invoice_items_behavior: 'include'. We stop
  // before finalize.
  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer:    stripeCustomerId,
      amount:      toStripeAmount(item.amount),
      currency:    'usd',
      description: item.description,
      metadata:    { chia_person_id: personId },
    })
  }

  const stripeInvoice = await stripe.invoices.create({
    customer:                       stripeCustomerId,
    collection_method:              'send_invoice',
    days_until_due:                 daysUntilDue,
    description:                    notes,
    auto_advance:                   false,
    pending_invoice_items_behavior: 'include',
    metadata:                       { chia_person_id: personId },
  })

  if (!stripeInvoice.id) throw new Error('Stripe returned an invoice with no id')

  return { stripeInvoiceId: stripeInvoice.id, stripeCustomerId }
}
