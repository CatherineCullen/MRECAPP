'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { stripe } from '@/lib/stripe/server'
import { ensureStripeCustomer } from '@/lib/stripe/customer'
import { assertStripeOutboundAllowed } from '@/lib/outbound'

/**
 * Send a single draft invoice.
 *
 * Finalizes the Stripe draft (locks the invoice, assigns a number) and
 * emails the hosted-invoice link to the customer. Then mirrors the state
 * change on the CHIA row (status=sent, sent_at=now).
 *
 * Returns { ok, stripeInvoiceId, hostedInvoiceUrl } per invoice so the UI
 * can surface the "open in Stripe" link.
 */
export async function sendDraftInvoice(params: {
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

  // Sync latest Person identity (name/email/phone) to Stripe before finalize.
  // Covers the case where admin edited a boarder's email in CHIA between
  // Generate and Send — the Stripe Customer is updated in place so the
  // invoice gets emailed to the right address. Best-effort: a Stripe
  // failure here is logged but doesn't block the send (the existing email
  // stays in place).
  try {
    await ensureStripeCustomer(inv.billed_to_id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[sendDraftInvoice] customer sync failed', inv.billed_to_id, msg)
  }

  // Finalize first — Stripe requires a finalized invoice before send. If
  // the invoice is already finalized on the Stripe side (e.g. an admin
  // finalized it manually in the dashboard), finalizeInvoice returns the
  // same invoice unchanged, so calling it again is safe.
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
    // Stripe side is already sent — we can't un-send. Log loudly and let
    // the webhook sync up state on next delivery.
    console.error('[sendDraftInvoice] CHIA update failed after Stripe send', inv.id, updErr.message)
    return {
      ok: false,
      error: `Stripe sent, but CHIA status update failed: ${updErr.message}. Webhook will reconcile.`,
    }
  }

  revalidatePath('/chia/boarding/drafts')
  revalidatePath('/chia/boarding/invoices')
  return { ok: true, stripeInvoiceId: finalizedId, hostedInvoiceUrl }
}

/**
 * Discard a draft invoice — the escape hatch for "generated but looks wrong".
 *
 * Deletes the Stripe draft (can't un-void; but for drafts delete is the
 * right semantic — they never reached the customer). Soft-deletes the
 * CHIA invoice + its line items. Unstamps the billing_period on the
 * source billing_line_items so they return to the open queue for the
 * admin to fix + re-generate.
 *
 * Cascade: when a billing_line_item is split across multiple people
 * (e.g. half-board on a shared horse), discarding one person's invoice
 * would orphan the other half — the billing_line_item stays stamped but
 * one allocation now points at a soft-deleted invoice row. To avoid that,
 * we compute the transitive closure of invoices that share any source
 * billing_line_item and discard them all together. The first call
 * returns the affected set for admin confirmation; the second call
 * (with `confirmCascade: true`) executes.
 */

type DiscardAffected = { invoiceId: string; personLabel: string }

export async function discardDraftInvoice(params: {
  invoiceId: string
  /** Set true on the confirm step to actually execute a multi-invoice
   * cascade. Single-invoice discards (no splits) proceed without it. */
  confirmCascade?: boolean
}): Promise<
  | { ok: true; discarded: DiscardAffected[] }
  | { ok: false; error: string; cascade?: DiscardAffected[] }
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
  if (inv.deleted_at) return { ok: false, error: 'Invoice is already deleted' }
  if (inv.status !== 'draft') return { ok: false, error: `Only drafts can be discarded (status: ${inv.status})` }

  // --- Phase 1: compute the cascade set ------------------------------------
  // Start with the requested invoice, expand by: "any invoice whose line
  // items share a billing_line_item with an invoice already in the set."
  // Repeat until stable. Typical closure size is 1 or 2; we cap iterations
  // to guard against pathological data.
  const invoiceSet = new Set<string>([inv.id])
  for (let iter = 0; iter < 10; iter++) {
    const invIds = Array.from(invoiceSet)
    const { data: lines } = await db
      .from('invoice_line_item')
      .select('invoice_id, billing_line_item_allocation_id')
      .in('invoice_id', invIds)
      .is('deleted_at', null)

    const allocIds = Array.from(new Set(
      (lines ?? [])
        .map(l => l.billing_line_item_allocation_id)
        .filter((x): x is string => !!x)
    ))
    if (allocIds.length === 0) break

    // Which billing_line_items are touched by this invoice set?
    const { data: allocs } = await db
      .from('billing_line_item_allocation')
      .select('id, billing_line_item_id')
      .in('id', allocIds)
    const touchedBLIs = Array.from(new Set((allocs ?? []).map(a => a.billing_line_item_id)))
    if (touchedBLIs.length === 0) break

    // Which live invoices ALSO touch those billing_line_items?
    const { data: siblingAllocs } = await db
      .from('billing_line_item_allocation')
      .select('id')
      .in('billing_line_item_id', touchedBLIs)
      .is('deleted_at', null)
    const siblingIds = (siblingAllocs ?? []).map(a => a.id)
    if (siblingIds.length === 0) break

    const { data: siblingLines } = await db
      .from('invoice_line_item')
      .select('invoice_id')
      .in('billing_line_item_allocation_id', siblingIds)
      .is('deleted_at', null)
    const siblingInvoiceIds = Array.from(new Set((siblingLines ?? []).map(l => l.invoice_id)))

    // Filter to live drafts — we never touch sent/paid invoices.
    const { data: liveInvoices } = await db
      .from('invoice')
      .select('id')
      .in('id', siblingInvoiceIds)
      .eq('status', 'draft')
      .is('deleted_at', null)
    const liveIds = new Set((liveInvoices ?? []).map(i => i.id))

    let grew = false
    for (const id of liveIds) {
      if (!invoiceSet.has(id)) { invoiceSet.add(id); grew = true }
    }
    if (!grew) break
  }

  // --- Phase 2: if cascade > 1 and not confirmed, return for confirmation --
  const allInvoiceIds = Array.from(invoiceSet)

  // Build person labels for every invoice in the cascade, for the confirm UI.
  const { data: cascadeInvoices } = await db
    .from('invoice')
    .select('id, billed_to_id')
    .in('id', allInvoiceIds)
  const personIds = Array.from(new Set((cascadeInvoices ?? []).map(i => i.billed_to_id)))
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)
  const labelFor = (pid: string): string => {
    const p = persons?.find(x => x.id === pid)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return [p.preferred_name ?? p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
  }
  const affected: DiscardAffected[] = (cascadeInvoices ?? []).map(i => ({
    invoiceId:   i.id,
    personLabel: labelFor(i.billed_to_id),
  }))

  if (allInvoiceIds.length > 1 && !params.confirmCascade) {
    return {
      ok:      false,
      error:   'cascade_required',
      cascade: affected,
    }
  }

  // --- Phase 3: execute ----------------------------------------------------
  // Gather every live line item + their billing_line_item_ids via their
  // allocations (we'll un-stamp these at the end).
  const { data: allLines } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, billing_line_item_allocation_id')
    .in('invoice_id', allInvoiceIds)
    .is('deleted_at', null)

  const allAllocIds = Array.from(new Set(
    (allLines ?? [])
      .map(l => l.billing_line_item_allocation_id)
      .filter((x): x is string => !!x)
  ))

  // Delete each Stripe draft. Best effort — a stripe error on one doesn't
  // block the rest; we log and continue so admin isn't left with a partial
  // cleanup when one invoice is already gone on the Stripe side.
  const { data: invoicesToDelete } = await db
    .from('invoice')
    .select('id, stripe_invoice_id')
    .in('id', allInvoiceIds)
  for (const i of invoicesToDelete ?? []) {
    if (!i.stripe_invoice_id) continue
    try {
      await stripe.invoices.del(i.stripe_invoice_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[discardDraftInvoice] stripe delete warning', i.stripe_invoice_id, msg)
    }
  }

  const now = new Date().toISOString()

  // Soft-delete all CHIA line items + invoices in the cascade.
  const { error: delLinesErr } = await db
    .from('invoice_line_item')
    .update({ deleted_at: now })
    .in('invoice_id', allInvoiceIds)
    .is('deleted_at', null)

  if (delLinesErr) return { ok: false, error: `Soft-delete lines failed: ${delLinesErr.message}` }

  const { error: delInvErr } = await db
    .from('invoice')
    .update({ deleted_at: now })
    .in('id', allInvoiceIds)

  if (delInvErr) return { ok: false, error: `Soft-delete invoice failed: ${delInvErr.message}` }

  // Un-stamp every billing_line_item that's now fully orphaned. Because
  // the cascade set spans every invoice that touched these rows, the
  // check collapses to "just un-stamp them all."
  if (allAllocIds.length > 0) {
    const { data: allocs } = await db
      .from('billing_line_item_allocation')
      .select('billing_line_item_id')
      .in('id', allAllocIds)
    const billingIds = Array.from(new Set((allocs ?? []).map(a => a.billing_line_item_id)))

    if (billingIds.length > 0) {
      const { error: unstampErr } = await db
        .from('billing_line_item')
        .update({ billing_period_start: null, billing_period_end: null })
        .in('id', billingIds)

      if (unstampErr) {
        // Not fatal — the invoices are gone, but the sources are orphaned
        // in "stamped but no invoice" state. Admin sees them missing from
        // the queue; log so we can reconcile.
        console.error('[discardDraftInvoice] unstamp failed', unstampErr.message)
      }
    }
  }

  revalidatePath('/chia/boarding/drafts')
  revalidatePath('/chia/boarding/invoices')
  return { ok: true, discarded: affected }
}
