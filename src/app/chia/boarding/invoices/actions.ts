'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { createDraftInvoice } from '@/lib/stripe/invoice'

/**
 * Allocate and mark a billing_line_item Reviewed.
 *
 * Shape of the call: caller supplies one {personId, amount} per billing
 * contact on the horse. The server validates:
 *   (a) caller is admin,
 *   (b) item is currently Draft,
 *   (c) allocations sum *exactly* to item.total (to the cent — we compare
 *       cent-int values to dodge float rounding),
 *   (d) each personId is an active billing contact on the item's horse.
 *
 * On success: deletes any prior allocation rows (defensive — shouldn't
 * exist while Draft, but handles re-submits cleanly), inserts the new
 * allocations, flips the item status to 'reviewed'.
 *
 * The sum-to-total check is the main invariant (ADR-0014). If the barn
 * absorbs part of a charge, admin adds a separate credit BillingLineItem
 * with a negative total — they don't under-allocate this one.
 */
export async function approveLineItem(params: {
  itemId: string
  allocations: Array<{ personId: string; amount: number }>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  // Load item + its horse's billing contacts in parallel.
  const { data: item, error: itemErr } = await db
    .from('billing_line_item')
    .select('id, horse_id, total, status, deleted_at')
    .eq('id', params.itemId)
    .single()

  if (itemErr || !item) return { ok: false, error: 'Line item not found' }
  if (item.deleted_at) return { ok: false, error: 'Line item is deleted' }
  if (item.status !== 'draft') return { ok: false, error: 'Line item is already reviewed' }

  // Any active HorseContact on the horse may receive an allocation. The
  // `is_billing_contact` flag is a UX pre-fill hint (default target), not
  // an authorization gate — the admin can allocate to any contact while
  // reviewing.
  const { data: contacts } = await db
    .from('horse_contact')
    .select('person_id')
    .eq('horse_id', item.horse_id)
    .is('deleted_at', null)

  const contactIds = new Set((contacts ?? []).map(c => c.person_id))

  // Validate each allocation's person is a contact on this horse.
  for (const a of params.allocations) {
    if (!contactIds.has(a.personId)) {
      return { ok: false, error: `Person ${a.personId} is not a contact on this horse` }
    }
  }

  // Validate sum-to-total, compared in cents to dodge float noise.
  const itemCents = Math.round(Number(item.total) * 100)
  const sumCents  = params.allocations.reduce((s, a) => s + Math.round(a.amount * 100), 0)
  if (sumCents !== itemCents) {
    const over = sumCents > itemCents
    const diff = Math.abs(sumCents - itemCents) / 100
    return {
      ok: false,
      error: `Allocations are ${over ? 'over' : 'under'} by $${diff.toFixed(2)}`,
    }
  }

  // Clear any prior allocations defensively, then insert the fresh set.
  const { error: delErr } = await db
    .from('billing_line_item_allocation')
    .delete()
    .eq('billing_line_item_id', item.id)

  if (delErr) return { ok: false, error: `Failed to clear prior allocations: ${delErr.message}` }

  if (params.allocations.length > 0) {
    const rows = params.allocations.map(a => ({
      billing_line_item_id: item.id,
      person_id:            a.personId,
      amount:               a.amount,
      created_by:           user.personId ?? null,
    }))
    const { error: insErr } = await db
      .from('billing_line_item_allocation')
      .insert(rows)
    if (insErr) return { ok: false, error: `Failed to insert allocations: ${insErr.message}` }
  }

  const { error: statusErr } = await db
    .from('billing_line_item')
    .update({ status: 'reviewed' })
    .eq('id', item.id)

  if (statusErr) return { ok: false, error: `Failed to mark reviewed: ${statusErr.message}` }

  revalidatePath('/chia/boarding/invoices')
  return { ok: true }
}

/**
 * Add one ad-hoc billing_line_item per selected horse. Used for two cases:
 *   - Single-horse: admin types a one-off charge on one horse.
 *   - Bulk: the wormer-across-all-boarders pattern — same description,
 *     quantity, unit price applied to N horses in one action.
 *
 * Ad-hoc rows have no source FKs (is_admin_added=true), so they show as
 * "Ad hoc" in the queue. All rows seed as Draft; admin then allocates
 * normally, one at a time (common case is 100% to the default contact so
 * that's a one-click sweep through the list).
 */
export async function addAdHocLineItems(params: {
  horseIds:   string[]
  description:string
  quantity:   number
  unitPrice:  number
  isCredit:   boolean
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  if (params.horseIds.length === 0) return { ok: false, error: 'Pick at least one horse' }
  const desc = params.description.trim()
  if (!desc) return { ok: false, error: 'Description is required' }
  if (!Number.isFinite(params.quantity)  || params.quantity  <= 0) return { ok: false, error: 'Quantity must be greater than zero' }
  if (!Number.isFinite(params.unitPrice))                         return { ok: false, error: 'Unit price is invalid' }

  const db = createAdminClient()

  const rows = params.horseIds.map(horseId => ({
    horse_id:       horseId,
    description:    desc,
    quantity:       params.quantity,
    unit_price:     params.unitPrice,
    is_credit:      params.isCredit,
    is_admin_added: true,
    status:         'draft' as const,
  }))

  const { error: insErr } = await db.from('billing_line_item').insert(rows)
  if (insErr) return { ok: false, error: `Failed to add charges: ${insErr.message}` }

  revalidatePath('/chia/boarding/invoices')
  return { ok: true, count: rows.length }
}

/**
 * Soft-delete a Draft line item. Only Draft items are deletable — once
 * Reviewed, admin must Undo first (to clear the allocation cleanly) and
 * then delete. Once on a generated invoice (billing_period_start set),
 * deletion is blocked entirely.
 *
 * Seed gate in loadQueue treats soft-deleted rows as "staged" so a deleted
 * service-log row doesn't re-seed itself on the next page load. If admin
 * genuinely needs it back, they re-log the service (or un-delete the row
 * via the DB).
 */
export async function deleteLineItem(params: {
  itemId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: item, error: itemErr } = await db
    .from('billing_line_item')
    .select('id, description, status, billing_period_start, deleted_at')
    .eq('id', params.itemId)
    .single()

  if (itemErr || !item) return { ok: false, error: 'Line item not found' }
  if (item.deleted_at) return { ok: false, error: 'Line item is already deleted' }
  if (item.billing_period_start) {
    return { ok: false, error: 'Line item is on a generated invoice and cannot be deleted' }
  }
  if (item.status !== 'draft') {
    return { ok: false, error: 'Un-approve first, then delete' }
  }

  // Training-ride aggregate cascade: if this line rolled up N training rides,
  // we mark each of them billing_skipped so they stay out of the queue but
  // remain visible on the horse timeline as "unbilled" (record preserved,
  // not billed). Without this step the rides would either (a) silently
  // disappear — FK stuck to a soft-deleted row — or (b) re-stage next load,
  // making the delete feel like a no-op. Skip is the middle path.
  const isTrainingRideAggregate = (item.description ?? '').startsWith('Training Rides — ')
  if (isTrainingRideAggregate) {
    const nowIso = new Date().toISOString()
    const { error: skipErr } = await db
      .from('training_ride')
      .update({
        billing_line_item_id:   null,
        billing_skipped_at:     nowIso,
        billing_skipped_by:     user.personId ?? null,
        billing_skipped_reason: 'Billing line deleted from Review & Allocate',
      })
      .eq('billing_line_item_id', item.id)
    if (skipErr) return { ok: false, error: `Failed to cascade skip to training rides: ${skipErr.message}` }
  }

  const { error: updErr } = await db
    .from('billing_line_item')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', item.id)

  if (updErr) return { ok: false, error: `Failed to delete: ${updErr.message}` }

  revalidatePath('/chia/boarding/invoices')
  if (isTrainingRideAggregate) revalidatePath('/chia/training-rides')
  return { ok: true }
}

/**
 * Edit a Draft line item. Scope differs by source:
 *   - ad_hoc:        description, quantity, unit_price, is_credit
 *   - service_log:   unit_price only (price override — description/qty stay
 *                    tied to the catalog service)
 *   - monthly_board: unit_price only (board rate override for this horse
 *                    this month — catalog rate unchanged)
 *
 * Reviewed items are not editable; admin Undoes first. Invoiced items are
 * never editable (billing_period_start set).
 */
export async function editLineItem(params: {
  itemId: string
  description?: string
  quantity?: number
  unitPrice?: number
  isCredit?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: item, error: itemErr } = await db
    .from('billing_line_item')
    .select('id, description, status, billing_period_start, deleted_at, source_board_service_id, source_board_service_log_id')
    .eq('id', params.itemId)
    .single()

  if (itemErr || !item) return { ok: false, error: 'Line item not found' }
  if (item.deleted_at) return { ok: false, error: 'Line item is deleted' }
  if (item.billing_period_start) {
    return { ok: false, error: 'Line item is on a generated invoice and cannot be edited' }
  }
  if (item.status !== 'draft') {
    return { ok: false, error: 'Un-approve first, then edit' }
  }

  // Training-ride aggregates are derived — description + quantity + unit_price
  // all reflect the underlying set of logged training rides. Allowing an
  // ad-hoc edit here would silently desync the line from its rides. To
  // change what's billed, admin unlogs individual rides (which decrements
  // the line in cascade) or deletes the whole line (which skips all of
  // them). Matches edge decision #3 — "forbid once allocated".
  if ((item.description ?? '').startsWith('Training Rides — ')) {
    return {
      ok: false,
      error: 'Training ride lines can\'t be edited directly — unlog individual rides or delete the line.',
    }
  }

  const isAdHoc = !item.source_board_service_id && !item.source_board_service_log_id

  // Build the update payload, filtering fields by source kind.
  const update: {
    unit_price?: number
    description?: string
    quantity?: number
    is_credit?: boolean
  } = {}
  if (params.unitPrice !== undefined) {
    if (!Number.isFinite(params.unitPrice)) return { ok: false, error: 'Unit price is invalid' }
    update.unit_price = params.unitPrice
  }
  if (isAdHoc) {
    if (params.description !== undefined) {
      const d = params.description.trim()
      if (!d) return { ok: false, error: 'Description is required' }
      update.description = d
    }
    if (params.quantity !== undefined) {
      if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
        return { ok: false, error: 'Quantity must be greater than zero' }
      }
      update.quantity = params.quantity
    }
    if (params.isCredit !== undefined) update.is_credit = params.isCredit
  }

  if (Object.keys(update).length === 0) return { ok: true }

  const { error: updErr } = await db
    .from('billing_line_item')
    .update(update)
    .eq('id', item.id)

  if (updErr) return { ok: false, error: `Failed to save: ${updErr.message}` }

  revalidatePath('/chia/boarding/invoices')
  return { ok: true }
}

/**
 * Flip a Reviewed item back to Draft. Clears its allocations so the admin
 * can re-enter them cleanly. Only allowed while the item is still in the
 * open queue (billing_period_start IS NULL) — once Generate stamps a
 * period_end, un-approving is blocked (that item is on a real invoice).
 */
export async function unApproveLineItem(params: {
  itemId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: item, error: itemErr } = await db
    .from('billing_line_item')
    .select('id, status, billing_period_start, deleted_at')
    .eq('id', params.itemId)
    .single()

  if (itemErr || !item) return { ok: false, error: 'Line item not found' }
  if (item.deleted_at) return { ok: false, error: 'Line item is deleted' }
  if (item.status !== 'reviewed') return { ok: false, error: 'Line item is not reviewed' }
  if (item.billing_period_start) {
    return { ok: false, error: 'Line item is already on a generated invoice' }
  }

  // Soft-delete the live allocations. Hard-delete would fail on FK from any
  // soft-deleted invoice_line_item still pointing here (e.g. after a
  // generate → discard cycle — the invoice_line_item is deleted_at but its
  // billing_line_item_allocation_id FK still references this row). Soft-
  // delete keeps the FK satisfied; loadQueue filters allocations on
  // deleted_at IS NULL so the admin re-allocates from a clean state.
  const { error: delErr } = await db
    .from('billing_line_item_allocation')
    .update({ deleted_at: new Date().toISOString() })
    .eq('billing_line_item_id', item.id)
    .is('deleted_at', null)

  if (delErr) return { ok: false, error: `Failed to clear allocations: ${delErr.message}` }

  const { error: statusErr } = await db
    .from('billing_line_item')
    .update({ status: 'draft' })
    .eq('id', item.id)

  if (statusErr) return { ok: false, error: `Failed to reset status: ${statusErr.message}` }

  revalidatePath('/chia/boarding/invoices')
  return { ok: true }
}

/**
 * Generate draft invoices for all Reviewed billing_line_items in the open
 * queue, one draft per person, grouped via each item's allocations.
 *
 * Flow per person:
 *   1. Collect their allocations across all Reviewed items in the period.
 *   2. Create a Stripe draft invoice + invoice items via createDraftInvoice.
 *   3. Insert a CHIA `invoice` row (status='draft') + one invoice_line_item
 *      per allocation, each linked back to its billing_line_item_allocation
 *      (ADR-0010 source FK).
 *   4. Stamp period_start/end on the source billing_line_items — that's the
 *      mechanism that pulls them out of the open queue.
 *
 * Per-person error isolation: if Stripe or DB fails for one person, other
 * persons still complete. The caller gets a per-person result array so the
 * UI can show partial success.
 *
 * Not-yet-sent: these are DRAFTS on both sides. Admin reviews them in the
 * Drafts view (next step) and batch-sends from there.
 */
export async function generateBoardInvoices(params: {
  periodStart: string  // ISO date yyyy-mm-dd
  periodEnd:   string  // ISO date yyyy-mm-dd
}): Promise<
  | { ok: true; results: Array<{ personId: string; personLabel: string; ok: boolean; stripeInvoiceId?: string; error?: string }> }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  // Basic period sanity — we rely on admin's judgment for the exact range
  // but the order has to make sense.
  if (params.periodStart > params.periodEnd) {
    return { ok: false, error: 'Period start must be on or before period end' }
  }

  const db = createAdminClient()

  // 1. Load all Reviewed, un-invoiced items + their allocations. We pull
  //    `total` so each line's description can show "X% of $Y" on splits.
  const { data: items, error: itemsErr } = await db
    .from('billing_line_item')
    .select('id, horse_id, description, total, is_credit, is_admin_added, source_board_service_log_id, source_board_service_id')
    .eq('status', 'reviewed')
    .is('billing_period_start', null)
    .is('deleted_at', null)

  if (itemsErr) return { ok: false, error: `Failed to load queue: ${itemsErr.message}` }
  if (!items || items.length === 0) return { ok: true, results: [] }

  const itemIds = items.map(i => i.id)
  const itemsById = new Map(items.map(i => [i.id, i]))

  const { data: allocs, error: allocsErr } = await db
    .from('billing_line_item_allocation')
    .select('id, billing_line_item_id, person_id, amount')
    .in('billing_line_item_id', itemIds)
    .is('deleted_at', null)

  if (allocsErr) return { ok: false, error: `Failed to load allocations: ${allocsErr.message}` }
  if (!allocs || allocs.length === 0) return { ok: true, results: [] }

  // 2. Group allocations by person. Look up each person's display label
  //    in one shot so the UI can report per-person success/failure.
  const personIds = Array.from(new Set(allocs.map(a => a.person_id)))
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)
  const personLabel = (id: string): string => {
    const p = persons?.find(x => x.id === id)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return [p.preferred_name ?? p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
  }

  const byPerson = new Map<string, typeof allocs>()
  for (const a of allocs) {
    const list = byPerson.get(a.person_id) ?? []
    list.push(a)
    byPerson.set(a.person_id, list)
  }

  // 3. For each person: Stripe draft → CHIA invoice → invoice_line_items.
  const results: Array<{ personId: string; personLabel: string; ok: boolean; stripeInvoiceId?: string; error?: string }> = []
  const successfullyInvoicedItemIds = new Set<string>()

  // Build a description that flags splits so the boarder can see why
  // they're being billed 50% of something — bake it into the text rather
  // than using fractional quantities (which would fight the generated
  // `total` column's rounding).
  function describe(parent: { description: string | null; total: number | string | null } | undefined, allocAmt: number): string {
    const base = parent?.description ?? 'Line item'
    const parentTotal = Number(parent?.total ?? 0)
    const absAlloc = Math.abs(allocAmt)
    const absParent = Math.abs(parentTotal)
    // Only annotate when it's actually a split (allocation < parent total,
    // with a penny of tolerance for rounding). Full 100% allocations render
    // plain.
    if (absParent <= 0 || absAlloc >= absParent - 0.005) return base
    const pct = Math.round((absAlloc / absParent) * 100)
    return `${base} — ${pct}% of $${absParent.toFixed(2)}`
  }

  for (const [personId, personAllocs] of byPerson) {
    try {
      const lineItems = personAllocs.map(a => {
        const parent = itemsById.get(a.billing_line_item_id)
        const allocAmt = Number(a.amount)
        return {
          description: describe(parent, allocAmt),
          // Credits stored as is_credit=true on the parent; Stripe just
          // wants a negative amount. Flip the sign here so the invoice
          // math nets correctly.
          amount: parent?.is_credit ? -allocAmt : allocAmt,
        }
      })

      const { stripeInvoiceId } = await createDraftInvoice({
        personId,
        lineItems,
        notes: `Boarding — ${params.periodStart} to ${params.periodEnd}`,
        daysUntilDue: 30,
      })

      // CHIA invoice row (draft — not sent yet).
      const { data: invRow, error: invErr } = await db
        .from('invoice')
        .insert({
          billed_to_id:      personId,
          period_start:      params.periodStart,
          period_end:        params.periodEnd,
          status:            'draft' as const,
          stripe_invoice_id: stripeInvoiceId,
          created_by:        user.personId ?? null,
        })
        .select('id')
        .single()

      if (invErr || !invRow) throw new Error(`invoice insert failed: ${invErr?.message ?? 'no row'}`)

      // Line items — one per allocation, linked back via
      // billing_line_item_allocation_id per ADR-0010.
      const lineRows = personAllocs.map(a => {
        const parent = itemsById.get(a.billing_line_item_id)
        const allocAmt = Number(a.amount)
        return {
          invoice_id:                      invRow.id,
          description:                     describe(parent, allocAmt),
          quantity:                        1,
          unit_price:                      allocAmt,
          is_credit:                       parent?.is_credit ?? false,
          is_admin_added:                  parent?.is_admin_added ?? false,
          horse_id:                        parent?.horse_id ?? null,
          line_item_type:                  'standard' as const,
          billing_line_item_allocation_id: a.id,
          // Pass-through source FKs so the invoice row retains the full
          // provenance trail — handy for reports that join back.
          board_service_log_id:            parent?.source_board_service_log_id ?? null,
          board_service_id:                parent?.source_board_service_id ?? null,
        }
      })

      const { error: lineErr } = await db.from('invoice_line_item').insert(lineRows)
      if (lineErr) throw new Error(`invoice_line_item insert failed: ${lineErr.message}`)

      // Remember which billing_line_items this person touched — we stamp
      // them after all persons are processed, so partial-failure doesn't
      // orphan an item into a weird state.
      for (const a of personAllocs) successfullyInvoicedItemIds.add(a.billing_line_item_id)

      results.push({ personId, personLabel: personLabel(personId), ok: true, stripeInvoiceId })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generateBoardInvoices] failed for person', personId, msg)
      results.push({ personId, personLabel: personLabel(personId), ok: false, error: msg })
    }
  }

  // 4. Stamp period on the billing_line_items we successfully invoiced.
  //    A billing_line_item only leaves the open queue once every one of
  //    its allocations was successfully invoiced — if one person's Stripe
  //    call blew up, we leave the source item in place and admin retries.
  const itemsFullyInvoiced = items.filter(i => {
    const itemAllocs = allocs.filter(a => a.billing_line_item_id === i.id)
    return itemAllocs.length > 0 && itemAllocs.every(a => {
      const r = results.find(r => r.personId === a.person_id)
      return r?.ok === true
    })
  }).map(i => i.id)

  if (itemsFullyInvoiced.length > 0) {
    const { error: stampErr } = await db
      .from('billing_line_item')
      .update({
        billing_period_start: params.periodStart,
        billing_period_end:   params.periodEnd,
      })
      .in('id', itemsFullyInvoiced)

    if (stampErr) {
      console.error('[generateBoardInvoices] period stamp failed', stampErr.message)
      // Not fatal — the Stripe + CHIA invoice rows exist. Admin will see
      // the items re-appear in the queue on refresh, which is a clear
      // "something needs cleanup" signal.
    }
  }

  revalidatePath('/chia/boarding/invoices')
  return { ok: true, results }
}
