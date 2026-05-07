'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { sendChiaInvoice } from '@/lib/payments/nmi/invoice'

/**
 * Boarding draft-invoice actions, NMI-flavored (PR 8c-2 of the
 * monthly-model rewrite).
 *
 * Semantic shift from the Stripe version:
 *   - Generate (in `boarding/invoices/actions.ts → generateBoardInvoices`)
 *     creates CHIA-side `invoice` rows with status='draft'. NO NMI call
 *     is made at generate time. NMI doesn't have a draft concept; we use
 *     the CHIA row's status as the draft state.
 *   - Send (here) calls NMI's `add_invoice` for each chia draft via
 *     `sendChiaInvoice`. NMI generates + emails the hosted pay-link in
 *     one step. We then update the chia row to status='sent' + stamp
 *     `nmi_invoice_id`.
 *   - Discard (here) becomes CHIA-only soft-delete + un-stamp the source
 *     billing_line_items so they return to the open queue. No provider
 *     call needed since NMI never knew about the draft.
 *
 * Returns the NMI invoice id on success.
 */

export async function sendDraftInvoice(params: {
  invoiceId: string
}): Promise<
  | { ok: true; nmiInvoiceId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  // Pre-flight check — sendChiaInvoice does its own validation but we
  // surface a clearer error message at this layer for the boarding UI.
  const { data: inv, error: invErr } = await db
    .from('invoice')
    .select('id, status, deleted_at')
    .eq('id', params.invoiceId)
    .single()

  if (invErr || !inv) return { ok: false, error: 'Invoice not found' }
  if (inv.deleted_at) return { ok: false, error: 'Invoice is deleted' }
  if (inv.status !== 'draft') return { ok: false, error: `Invoice is already ${inv.status}` }

  try {
    const result = await sendChiaInvoice({ chiaInvoiceId: params.invoiceId })
    revalidatePath('/chia/boarding/drafts')
    revalidatePath('/chia/boarding/invoices')
    return { ok: true, nmiInvoiceId: result.nmiInvoiceId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Send failed: ${msg}` }
  }
}

/**
 * Discard a draft invoice — the escape hatch for "generated but looks wrong".
 *
 * Under NMI, no provider-side draft exists, so discard is a CHIA-only
 * soft-delete + un-stamp the source billing_line_items so they return
 * to the open queue.
 *
 * Cascade: when a billing_line_item is split across multiple people
 * (e.g. half-board on a shared horse), discarding one person's invoice
 * would orphan the other half — the billing_line_item stays stamped but
 * one allocation now points at a soft-deleted invoice row. To avoid
 * that, we compute the transitive closure of invoices that share any
 * source billing_line_item and discard them all together. The first
 * call returns the affected set for admin confirmation; the second call
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
    .select('id, status, deleted_at, billed_to_id')
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
        .map((l) => l.billing_line_item_allocation_id)
        .filter((x): x is string => !!x),
    ))
    if (allocIds.length === 0) break

    const { data: allocs } = await db
      .from('billing_line_item_allocation')
      .select('id, billing_line_item_id')
      .in('id', allocIds)
    const touchedBLIs = Array.from(new Set((allocs ?? []).map((a) => a.billing_line_item_id)))
    if (touchedBLIs.length === 0) break

    const { data: siblingAllocs } = await db
      .from('billing_line_item_allocation')
      .select('id')
      .in('billing_line_item_id', touchedBLIs)
      .is('deleted_at', null)
    const siblingIds = (siblingAllocs ?? []).map((a) => a.id)
    if (siblingIds.length === 0) break

    const { data: siblingLines } = await db
      .from('invoice_line_item')
      .select('invoice_id')
      .in('billing_line_item_allocation_id', siblingIds)
      .is('deleted_at', null)
    const siblingInvoiceIds = Array.from(new Set((siblingLines ?? []).map((l) => l.invoice_id)))

    const { data: liveInvoices } = await db
      .from('invoice')
      .select('id')
      .in('id', siblingInvoiceIds)
      .eq('status', 'draft')
      .is('deleted_at', null)
    const liveIds = new Set((liveInvoices ?? []).map((i) => i.id))

    let grew = false
    for (const id of liveIds) {
      if (!invoiceSet.has(id)) { invoiceSet.add(id); grew = true }
    }
    if (!grew) break
  }

  // --- Phase 2: if cascade > 1 and not confirmed, return for confirmation --
  const allInvoiceIds = Array.from(invoiceSet)

  const { data: cascadeInvoices } = await db
    .from('invoice')
    .select('id, billed_to_id')
    .in('id', allInvoiceIds)
  const personIds = Array.from(new Set((cascadeInvoices ?? []).map((i) => i.billed_to_id)))
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)
  const labelFor = (pid: string): string => {
    const p = persons?.find((x) => x.id === pid)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return [p.preferred_name ?? p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
  }
  const affected: DiscardAffected[] = (cascadeInvoices ?? []).map((i) => ({
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
  const { data: allLines } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, billing_line_item_allocation_id')
    .in('invoice_id', allInvoiceIds)
    .is('deleted_at', null)

  const allAllocIds = Array.from(new Set(
    (allLines ?? [])
      .map((l) => l.billing_line_item_allocation_id)
      .filter((x): x is string => !!x),
  ))

  const now = new Date().toISOString()

  // Soft-delete all CHIA line items + invoices in the cascade. (No NMI
  // call — drafts never reached the provider.)
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
    const billingIds = Array.from(new Set((allocs ?? []).map((a) => a.billing_line_item_id)))

    if (billingIds.length > 0) {
      const { error: unstampErr } = await db
        .from('billing_line_item')
        .update({ billing_period_start: null, billing_period_end: null })
        .in('id', billingIds)

      if (unstampErr) {
        console.error('[discardDraftInvoice] unstamp failed', unstampErr.message)
      }
    }
  }

  revalidatePath('/chia/boarding/drafts')
  revalidatePath('/chia/boarding/invoices')
  return { ok: true, discarded: affected }
}
