import 'server-only'
import { nmiCall } from './client'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import { assertNmiOutboundAllowed } from '@/lib/outbound'

/**
 * Wrappers around NMI's Electronic Invoicing API for CHIA's billing pipeline.
 *
 * Core flow (NMI is single-call: invoice creation immediately emails the
 * hosted pay-link to the customer):
 *   1. createAndSendInvoice() — POST `invoicing=add_invoice` with line items.
 *      NMI generates the hosted pay page, emails the customer, returns
 *      invoice_id. No separate finalize/send step (unlike Stripe).
 *   2. webhook events — `transaction.sale.success` → reconcile to Paid.
 *      Webhook receiver lives at /api/webhooks/nmi (built in PR 8).
 *
 * We mirror each NMI invoice as a row in our own `invoice` table via
 * `nmi_invoice_id`. The DB row is the source of truth for CHIA features
 * (dashboards, line-item source FKs per ADR-0010, allocations per ADR-0014);
 * NMI is the source of truth for payment state, which flows back via the
 * webhook.
 *
 * Money: NMI takes amounts as decimal strings ("1.00"). Our DB stores
 * dollars as numeric. `formatNmiAmount` is the one conversion point.
 *
 * Correlation: we pass `orderid=<chia_invoice.id>` on every call so the
 * webhook handler can look up our row via `event_body.order_id` (verified
 * in 2026-05-07 sandbox probe — NMI's webhook does NOT include invoice_id
 * in the body, so orderid is our only correlation field).
 */

export function formatNmiAmount(dollars: number): string {
  // NMI accepts dollars as decimal strings with 2 decimal places.
  return dollars.toFixed(2)
}

export type LineItemInput = {
  description: string
  /** Dollars, not cents — formatted to NMI's expected string shape inside. */
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
  lessonMonthId?: string
  campEnrollmentId?: string
  boardServiceLogId?: string
  eventId?: string
  horseId?: string
}

/**
 * Create a finalized, sent NMI invoice for a Person from a list of line
 * items, and mirror it as a row in our `invoice` table.
 *
 * NMI's add_invoice is a single call that creates AND emails the hosted
 * pay-link in one step — there's no separate draft/finalize/send like
 * Stripe. Returns the NMI invoice id and the orderid we stamped (which
 * matches our chia invoice id) for the admin UI to surface.
 *
 * Caller is responsible for ensuring the Person has email + first/last
 * name — NMI rejects add_invoice without these.
 */
export async function createAndSendInvoice(params: {
  personId: string
  lineItems: LineItemInput[]
  notes?: string
  daysUntilDue?: number
}): Promise<{ nmiInvoiceId: string; chiaInvoiceId: string }> {
  const { personId, lineItems, notes, daysUntilDue = 30 } = params

  if (lineItems.length === 0) {
    throw new Error('Cannot create an invoice with no line items')
  }

  const db = createAdminClient()

  const { data: person, error: personErr } = await db
    .from('person')
    .select(
      'id, first_name, last_name, preferred_name, is_organization, organization_name, email, phone, address',
    )
    .eq('id', personId)
    .single()

  if (personErr || !person) {
    throw new Error(`Person ${personId} not found: ${personErr?.message ?? 'no rows'}`)
  }

  if (!person.email) {
    throw new Error(`Cannot invoice person ${personId}: no email on record`)
  }

  // Compute the invoice row first so we have a chia_invoice_id to stamp on
  // the NMI orderid field. The webhook handler uses orderid for correlation
  // (NMI does not include invoice_id in webhook payloads — verified
  // 2026-05-07).
  const today = new Date().toISOString().slice(0, 10)
  const dueDate = new Date(Date.now() + daysUntilDue * 86400_000).toISOString().slice(0, 10)

  const { data: chiaInvoice, error: insertErr } = await db
    .from('invoice')
    .insert({
      billed_to_id: personId,
      period_start: today,
      period_end: today,
      // status starts at 'draft' — flipped to 'sent' below once NMI confirms
      // the email went out. Webhook later flips to 'paid' on payment.
      status: 'draft',
      due_date: dueDate,
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !chiaInvoice) {
    throw new Error(`Failed to create chia invoice row: ${insertErr?.message ?? 'unknown'}`)
  }

  // Build the NMI request body. We pass orderid=chiaInvoice.id so the
  // webhook can find this row when payment lands. We pass billing fields
  // we have (NMI uses them on the receipt and PDF — though not pre-filled
  // on the pay page in sandbox; that UX gap is documented in ADR-0021).
  const fullName = displayName(person)
  // For organizations, NMI Vault has a `company` field; on add_invoice we
  // can pass it the same way. first/last are still required by NMI even
  // for orgs, so we put the org name in last_name as a fallback when
  // there's no individual name.
  const firstName = person.is_organization ? '' : person.first_name
  const lastName = person.is_organization
    ? person.organization_name?.trim() || fullName || 'Organization'
    : person.last_name

  const body: Record<string, string | number> = {
    'invoicing': 'add_invoice',
    'amount': formatNmiAmount(
      lineItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0),
    ),
    'email': person.email,
    'first_name': firstName,
    'last_name': lastName,
    'orderid': chiaInvoice.id,
    'payment_terms': `net_${daysUntilDue}`,
  }

  if (person.is_organization && person.organization_name) {
    body.company = person.organization_name
  }
  if (person.phone) {
    body.phone = person.phone
  }
  if (person.address) {
    // CHIA stores a single text address blob; NMI wants address1. We pass
    // it as-is to address1 — riders re-enter on the pay page anyway since
    // NMI doesn't pre-fill from invoice billing fields.
    body.address1 = person.address
  }
  if (notes) {
    body.order_description = notes
  }

  // Line items: NMI accepts up to ~20 indexed line items with
  // `item_description_N`, `item_unit_cost_N`, `item_quantity_N` fields.
  lineItems.forEach((item, i) => {
    const n = i + 1
    body[`item_description_${n}`] = item.description
    body[`item_unit_cost_${n}`] = formatNmiAmount(item.unitPrice)
    body[`item_quantity_${n}`] = String(item.quantity)
  })

  // Stamp our chia_invoice.id on a merchant_defined_field too, as a backup
  // correlation key in case orderid ever fails (NMI seems to also default
  // orderid to transaction_id when not supplied — defensive double-stamping).
  body.merchant_defined_field_1 = chiaInvoice.id

  // Kill switch: add_invoice is the point where NMI emails the customer.
  // Always gated (NMI has no "safe test inbox" equivalent of Stripe's
  // dashboard-simulated emails — sandbox emails go to the merchant
  // account's real inbox).
  assertNmiOutboundAllowed('nmi_invoice_send')

  const nmiResponse = await nmiCall(body)

  if (!nmiResponse.invoice_id) {
    // Should never happen — nmiCall throws on response != '1', and a
    // successful add_invoice always returns an invoice_id. But the type
    // says it can be undefined, so guard.
    throw new Error('NMI returned approved response but no invoice_id')
  }

  // Flip the chia invoice to 'sent' and stamp nmi_invoice_id for audit
  // and cross-reference UI. Line items are inserted separately by
  // callers once they have the source FK context (ADR-0010).
  const sentAt = new Date().toISOString()
  const { error: updateErr } = await db
    .from('invoice')
    .update({
      status: 'sent',
      sent_at: sentAt,
      nmi_invoice_id: nmiResponse.invoice_id,
    })
    .eq('id', chiaInvoice.id)

  if (updateErr) {
    // The NMI invoice is already sent — can't un-send it. Log loudly so
    // the admin can manually reconcile. Mirrors Stripe's posture (the
    // remote provider is authoritative once the email has gone out).
    console.error(
      '[nmi invoice] DB update failed for nmi invoice',
      nmiResponse.invoice_id,
      updateErr.message,
    )
    throw new Error(
      `NMI invoice ${nmiResponse.invoice_id} was sent but DB update failed: ${updateErr.message}. Manual reconciliation required.`,
    )
  }

  return {
    nmiInvoiceId: nmiResponse.invoice_id,
    chiaInvoiceId: chiaInvoice.id,
  }
}

/**
 * Send an existing CHIA invoice via NMI. Used by the boarding draft flow
 * where the chia `invoice` + `invoice_line_item` rows are created at
 * generate time (status='draft', no NMI call yet) and only land at NMI
 * when admin clicks Send. Distinct from `createAndSendInvoice` above
 * (which creates the CHIA rows itself).
 *
 * Reads the existing chia invoice and its line items, builds the NMI
 * request body, calls `add_invoice`, updates the chia row with
 * `nmi_invoice_id` and status='sent'. Returns the NMI invoice id for
 * the caller to surface in the UI.
 *
 * Throws on:
 *   - Invoice not found / soft-deleted
 *   - Invoice not in 'draft' status
 *   - Person lookup failure
 *   - Person has no email
 *   - NMI rejection (NmiError, surfaced from nmiCall)
 *   - Post-send DB update failure (NMI side already sent — manual reconcile)
 */
export async function sendChiaInvoice(params: {
  chiaInvoiceId: string
  daysUntilDue?: number
}): Promise<{ nmiInvoiceId: string }> {
  const { chiaInvoiceId, daysUntilDue = 30 } = params
  const db = createAdminClient()

  // 1. Load the chia invoice + line items + billed-to person.
  const { data: invoice, error: invErr } = await db
    .from('invoice')
    .select(`
      id, billed_to_id, status, deleted_at, period_start, period_end, notes,
      invoice_line_item ( id, description, quantity, unit_price, is_credit )
    `)
    .eq('id', chiaInvoiceId)
    .single()

  if (invErr || !invoice) {
    throw new Error(`Invoice ${chiaInvoiceId} not found: ${invErr?.message ?? 'no row'}`)
  }
  if (invoice.deleted_at) throw new Error(`Invoice ${chiaInvoiceId} is soft-deleted`)
  if (invoice.status !== 'draft') {
    throw new Error(`Invoice ${chiaInvoiceId} is ${invoice.status}, not draft — refusing to re-send`)
  }

  const lineItems = (invoice.invoice_line_item ?? []).filter((li) => li.id)
  if (lineItems.length === 0) {
    throw new Error(`Invoice ${chiaInvoiceId} has no line items — refusing to send empty invoice`)
  }

  const { data: person, error: personErr } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name, email, phone, address')
    .eq('id', invoice.billed_to_id)
    .single()

  if (personErr || !person) {
    throw new Error(`Person ${invoice.billed_to_id} not found: ${personErr?.message ?? 'no row'}`)
  }
  if (!person.email) {
    throw new Error(`Cannot send invoice ${chiaInvoiceId}: billed-to person has no email`)
  }

  // 2. Build NMI request body. Same shape as createAndSendInvoice but
  //    the line items come from the existing chia rows. Sign credits
  //    negative so the totals net correctly.
  const fullName  = displayName(person)
  const firstName = person.is_organization ? '' : person.first_name
  const lastName  = person.is_organization
    ? person.organization_name?.trim() || fullName || 'Organization'
    : person.last_name

  const totalCents = lineItems.reduce((sum, li) => {
    const amt = Number(li.unit_price) * Number(li.quantity ?? 1)
    return sum + (li.is_credit ? -amt : amt)
  }, 0)

  const body: Record<string, string | number> = {
    'invoicing':    'add_invoice',
    'amount':       formatNmiAmount(totalCents),
    'email':        person.email,
    'first_name':   firstName,
    'last_name':    lastName,
    'orderid':      chiaInvoiceId,
    'payment_terms': `net_${daysUntilDue}`,
  }

  if (person.is_organization && person.organization_name) {
    body.company = person.organization_name
  }
  if (person.phone)   body.phone = person.phone
  if (person.address) body.address1 = person.address
  if (invoice.notes)  body.order_description = invoice.notes

  lineItems.forEach((li, i) => {
    const n = i + 1
    const amt = Number(li.unit_price)
    body[`item_description_${n}`] = li.description ?? ''
    body[`item_unit_cost_${n}`]   = formatNmiAmount(li.is_credit ? -amt : amt)
    body[`item_quantity_${n}`]    = String(li.quantity ?? 1)
  })

  body.merchant_defined_field_1 = chiaInvoiceId

  // 3. Kill switch + send.
  assertNmiOutboundAllowed('nmi_invoice_send')
  const nmiResponse = await nmiCall(body)

  if (!nmiResponse.invoice_id) {
    throw new Error('NMI returned approved response but no invoice_id')
  }

  // 4. Flip the chia invoice to 'sent' and stamp nmi_invoice_id. If this
  //    fails NMI has already emailed — log loudly so admin reconciles.
  const sentAt = new Date().toISOString()
  const { error: updateErr } = await db
    .from('invoice')
    .update({
      status:         'sent',
      sent_at:        sentAt,
      nmi_invoice_id: nmiResponse.invoice_id,
    })
    .eq('id', chiaInvoiceId)

  if (updateErr) {
    console.error(
      '[nmi sendChiaInvoice] DB update failed for nmi invoice',
      nmiResponse.invoice_id,
      updateErr.message,
    )
    throw new Error(
      `NMI invoice ${nmiResponse.invoice_id} was sent but DB update failed: ${updateErr.message}. Manual reconciliation required.`,
    )
  }

  return { nmiInvoiceId: nmiResponse.invoice_id }
}
