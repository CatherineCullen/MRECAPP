import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

/**
 * Billing Review queue loader.
 *
 * Always-on model: on page load, we (1) seed billing_line_item rows for any
 * reviewed board_service_log that hasn't been staged yet, and (2) load the
 * current open queue for rendering. Monthly board is added explicitly via
 * the "Add monthly board" action — no auto-seed.
 *
 * "Open queue" = billing_line_item rows where billing_period_start IS NULL
 * (not yet invoiced). Once Generate Invoices stamps a period_end on a row,
 * it disappears from this view and lives on the historical invoice.
 *
 * Horses with no active billing contacts are silently skipped — no Monthly
 * Board line is seeded for them. See Q (billing design): "Horse with no
 * billing contacts → silently skipped; admin notices if a boarder is
 * missing and fixes the contact."
 */

export type QueueAllocation = {
  id: string
  personId: string
  amount: number
}

export type QueueLineItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
  isCredit: boolean
  isAdminAdded: boolean
  status: 'draft' | 'reviewed'
  sourceBoardServiceLogId: string | null
  sourceBoardServiceId: string | null
  sourceKind: 'monthly_board' | 'service_log' | 'training_ride' | 'ad_hoc'
  createdAt: string
  loggedAt: string | null  // for service logs — when the service actually happened
  notes: string | null     // for service logs — the barn worker's note at log time
  allocations: QueueAllocation[]
}

export type BillingContactOpt = {
  horseContactId: string
  personId: string
  label: string
  /** Pre-fill target when the allocation grid opens. Exactly-one-default
   * triggers the single-click Approve fast path; multiple defaults split
   * evenly; zero defaults means the horse is silently skipped from the
   * queue entirely (see seed gate below). */
  isDefault: boolean
}

export type HorseGroup = {
  horseId: string
  barnName: string
  /** False for barn-owned and free-lease horses: no Monthly Board is
   * auto-seeded, and the horse only appears in the queue when it has
   * some other billable activity. */
  chargesMonthlyBoard: boolean
  billingContacts: BillingContactOpt[]
  items: QueueLineItem[]
  subtotal: number
}

export type BoardServiceOption = {
  id: string
  name: string
  isBillable: boolean
  unitPrice: number | null
}

export type QueueSnapshot = {
  horseGroups: HorseGroup[]
  monthlyBoardServiceId: string | null
  monthlyBoardUnitPrice: number | null
  /** Catalog for the per-horse "+ Add service" picker. Excludes Monthly
   * Board (that's auto-seeded, not logged). Includes billable and
   * non-billable services — admin may want to log a non-billable for
   * chronology visibility even though it won't show on an invoice. */
  services: BoardServiceOption[]
  totalDraft: number
  totalReviewed: number
}

export async function loadQueue(): Promise<QueueSnapshot> {
  const db = createAdminClient()

  // --- Monthly Board catalog row (single row enforced by unique index) ----
  const { data: monthly } = await db
    .from('board_service')
    .select('id, unit_price')
    .eq('is_recurring_monthly', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle()

  const monthlyBoardServiceId = monthly?.id ?? null
  const monthlyBoardUnitPrice = monthly?.unit_price ? Number(monthly.unit_price) : null

  // --- Active horses with at least one active billing contact -------------
  // We pull all contacts in one go, then group client-side — simpler than a
  // nested aggregate query and the horse count is small (~25 at MR scale).
  const { data: horses } = await db
    .from('horse')
    .select(`
      id, barn_name, charges_monthly_board,
      contacts:horse_contact (
        id, person_id, is_billing_contact, deleted_at,
        person:person ( id, first_name, last_name, preferred_name, is_organization, organization_name, is_minor )
      )
    `)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  const eligibleHorses = (horses ?? [])
    .map(h => {
      const billingContacts: BillingContactOpt[] = (h.contacts ?? [])
        .filter((c: { deleted_at: string | null }) => c.deleted_at === null)
        // Minors are never billable — they show on the horse as Owner/contact
        // for visibility, but billing routes through their guardian. Drop
        // them from allocation options so they can't receive invoice lines.
        .filter((c: { person: { is_minor: boolean | null } | null }) => !c.person?.is_minor)
        .map((c: {
          id: string
          person_id: string
          is_billing_contact: boolean
          person: {
            id: string
            first_name: string | null
            last_name: string | null
            preferred_name: string | null
            is_organization: boolean | null
            organization_name: string | null
            is_minor: boolean | null
          } | null
        }) => ({
          horseContactId: c.id,
          personId: c.person_id,
          label: c.person ? displayName(c.person) : 'Unknown',
          isDefault: c.is_billing_contact,
        }))
      return {
        id: h.id,
        barnName: h.barn_name ?? 'Unnamed horse',
        chargesMonthlyBoard: h.charges_monthly_board !== false,
        billingContacts,
      }
    })
    // Horse is eligible iff it has at least one default-flagged contact.
    // Zero-default horses are silently skipped so admin notices the missing
    // flag; any contacts on the horse with default=false still participate
    // in allocation once the horse is eligible.
    .filter(h => h.billingContacts.some(c => c.isDefault))

  // --- Seed rows for any service log not yet staged -----------------------
  // The admin no longer has a separate Review Queue — the Invoices surface
  // is the single triage point. Logs show up as Draft line items the
  // moment a barn worker records them; admin edits/deletes/allocates here.
  const eligibleHorseIds = eligibleHorses.map(h => h.id)

  if (eligibleHorseIds.length > 0) {
    const { data: reviewedLogs } = await db
      .from('board_service_log')
      .select(`
        id, horse_id, unit_price, notes, logged_at,
        service:board_service!board_service_log_service_id_fkey ( id, name )
      `)
      .eq('is_billable', true)
      .is('invoice_line_item_id', null)
      .in('horse_id', eligibleHorseIds)

    const candidateLogIds = (reviewedLogs ?? []).map(l => l.id)

    if (candidateLogIds.length > 0) {
      // Which of these already have a billing_line_item?
      // Include soft-deleted rows: once a service log has ever been staged
      // (even if the admin later deleted that billing row as an error), we
      // don't re-stage it. The service log side is the source of truth for
      // "should this exist" — if admin deletes here, they're saying "nope."
      const { data: alreadyStaged } = await db
        .from('billing_line_item')
        .select('source_board_service_log_id')
        .in('source_board_service_log_id', candidateLogIds)

      const staged = new Set(
        (alreadyStaged ?? [])
          .map(r => r.source_board_service_log_id)
          .filter((x): x is string => x !== null)
      )
      const toStage = (reviewedLogs ?? []).filter(l => !staged.has(l.id))

      if (toStage.length > 0) {
        const rows = toStage.map(l => {
          const svc = l.service as { name?: string } | null
          return {
            horse_id:                    l.horse_id,
            description:                 svc?.name ?? 'Service',
            quantity:                    1,
            unit_price:                  Number(l.unit_price ?? 0),
            is_credit:                   false,
            is_admin_added:              false,
            source_board_service_log_id: l.id,
            status:                      'draft' as const,
          }
        })
        await db.from('billing_line_item').insert(rows)
      }
    }
  }

  // --- Seed rows for any logged training ride not yet staged --------------
  // Training rides bill through the same monthly boarder invoice as Monthly
  // Board + services. We aggregate by (horse, provider, rate) so the invoice
  // reads "Training Rides — Sarah Smith (12 × $50)" instead of twelve line
  // items.
  //
  // Gate: only `logged` rides are staged. Scheduled rides (not yet ridden)
  // pass by — consistent with the "visibility, not compliance" principle
  // and the broader pattern that non-lesson calendar entries don't bill
  // until they're recorded.
  //
  // Re-seed is naturally prevented by billing_line_item_id being set on
  // each ride once it's rolled into an aggregate row. Admin-deleted
  // aggregate rows leave the ride FKs pointing at a soft-deleted row, so
  // they also won't be re-staged — same audit respect as service logs.
  //
  // Aggregate rows have source_training_ride_id = NULL because they
  // represent multiple rides; detection downstream uses the "Training
  // Rides — " description prefix (survives orphans — see below).
  //
  // Idempotency: seed can run many times between invoice generation (every
  // page load). It must NEVER create a second aggregate for the same
  // (horse, provider, rate) while one is still open. If insert+update
  // desyncs (network hiccup after insert, before rides are linked), the
  // next run would otherwise spawn a duplicate. We guard by looking up
  // any existing open aggregate for the group FIRST and extending it
  // rather than inserting a new one.
  if (eligibleHorseIds.length > 0) {
    // Self-heal: kill any open (draft, un-invoiced) training-ride aggregate
    // that has zero live rides linked to it. Orphans accumulate if a past
    // seed run inserted an aggregate but the subsequent ride-link update
    // never landed (pre-idempotency bug, network hiccup, etc.). The seed
    // code as it stands now won't create new ones — this step cleans up
    // the residue so admin counts stay accurate.
    const { data: liveAggs } = await db
      .from('billing_line_item')
      .select('id')
      .in('horse_id', eligibleHorseIds)
      .is('billing_period_start', null)
      .is('deleted_at', null)
      .eq('status', 'draft')
      .like('description', 'Training Rides — %')

    if ((liveAggs ?? []).length > 0) {
      const aggIds = (liveAggs ?? []).map(a => a.id)
      const { data: stillLinked } = await db
        .from('training_ride')
        .select('billing_line_item_id')
        .in('billing_line_item_id', aggIds)
        .is('deleted_at', null)
      const linkedSet = new Set(
        (stillLinked ?? [])
          .map(r => r.billing_line_item_id)
          .filter((x): x is string => x !== null),
      )
      const orphans = aggIds.filter(id => !linkedSet.has(id))
      if (orphans.length > 0) {
        await db
          .from('billing_line_item')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', orphans)
      }
    }

    const { data: unbilledRides } = await db
      .from('training_ride')
      .select('id, horse_id, rider_id, unit_price')
      .eq('status', 'logged')
      .is('billing_line_item_id', null)
      .is('billing_skipped_at', null)
      .is('deleted_at', null)
      .in('horse_id', eligibleHorseIds)

    if ((unbilledRides ?? []).length > 0) {
      // Group by (horse, provider, rate)
      type Group = { horseId: string; riderId: string; unitPrice: number; rideIds: string[] }
      const groups = new Map<string, Group>()
      for (const r of unbilledRides ?? []) {
        const price = Number(r.unit_price ?? 0)
        const key = `${r.horse_id}|${r.rider_id}|${price}`
        const g = groups.get(key) ?? { horseId: r.horse_id, riderId: r.rider_id, unitPrice: price, rideIds: [] }
        g.rideIds.push(r.id)
        groups.set(key, g)
      }

      // Look up provider display names in one shot
      const providerIds = Array.from(new Set(Array.from(groups.values()).map(g => g.riderId)))
      const { data: providers } = await db
        .from('person')
        .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
        .in('id', providerIds)
      const providerNameById = new Map<string, string>()
      for (const p of providers ?? []) providerNameById.set(p.id, displayName(p))

      // Fetch all open training-ride aggregates on eligible horses up-front
      // — one query, match per group in JS. "Open" means not yet rolled
      // into an invoice (billing_period_start IS NULL) and not deleted.
      const { data: openAggs } = await db
        .from('billing_line_item')
        .select('id, horse_id, unit_price, quantity, description')
        .in('horse_id', eligibleHorseIds)
        .is('billing_period_start', null)
        .is('deleted_at', null)
        .like('description', 'Training Rides — %')

      for (const g of groups.values()) {
        const providerName = providerNameById.get(g.riderId) ?? 'Provider'
        const rateStr = g.unitPrice.toFixed(2).replace(/\.00$/, '')
        const descPrefix = `Training Rides — ${providerName} (`

        // Match an existing open aggregate: same horse, same rate, same
        // provider (via description prefix). Rate comparison is loose on
        // the numeric side — Supabase returns unit_price as string.
        const existing = (openAggs ?? []).find(r =>
          r.horse_id === g.horseId &&
          Number(r.unit_price) === g.unitPrice &&
          (r.description ?? '').startsWith(descPrefix)
        )

        if (existing) {
          // Count rides already linked to this aggregate, add new ones to it.
          const { data: linked } = await db
            .from('training_ride')
            .select('id')
            .eq('billing_line_item_id', existing.id)
            .is('deleted_at', null)
          const linkedCount = linked?.length ?? 0
          const newTotal = linkedCount + g.rideIds.length

          await db
            .from('billing_line_item')
            .update({
              description: `Training Rides — ${providerName} (${newTotal} × $${rateStr})`,
              quantity:    newTotal,
            })
            .eq('id', existing.id)

          await db
            .from('training_ride')
            .update({ billing_line_item_id: existing.id })
            .in('id', g.rideIds)
        } else {
          const { data: inserted, error: insErr } = await db
            .from('billing_line_item')
            .insert({
              horse_id:       g.horseId,
              description:    `Training Rides — ${providerName} (${g.rideIds.length} × $${rateStr})`,
              quantity:       g.rideIds.length,
              unit_price:     g.unitPrice,
              is_credit:      false,
              is_admin_added: false,
              status:         'draft' as const,
            })
            .select('id')
            .single()

          if (insErr || !inserted) continue

          await db
            .from('training_ride')
            .update({ billing_line_item_id: inserted.id })
            .in('id', g.rideIds)
        }
      }
    }
  }

  // --- Load the open queue (period IS NULL) -------------------------------
  const { data: rawItems } = await db
    .from('billing_line_item')
    .select(`
      id, horse_id, description, quantity, unit_price, total, is_credit,
      is_admin_added, source_board_service_log_id, source_board_service_id,
      status, created_at,
      log:board_service_log!billing_line_item_source_board_service_log_id_fkey (
        logged_at, notes
      )
    `)
    .in('horse_id', eligibleHorseIds)
    .is('billing_period_start', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const itemIds = (rawItems ?? []).map(r => r.id)

  // Training-ride aggregates are identified by description prefix rather
  // than reverse FK: an orphaned aggregate (created before its rides were
  // linked) still deserves to be tagged — and re-tagged as ad_hoc would
  // hide it from any training-ride-specific UI handling later.

  // --- Load existing allocations for these items --------------------------
  const allocsByItem = new Map<string, QueueAllocation[]>()
  if (itemIds.length > 0) {
    const { data: allocs } = await db
      .from('billing_line_item_allocation')
      .select('id, billing_line_item_id, person_id, amount')
      .in('billing_line_item_id', itemIds)
      .is('deleted_at', null)

    for (const a of allocs ?? []) {
      const list = allocsByItem.get(a.billing_line_item_id) ?? []
      list.push({ id: a.id, personId: a.person_id, amount: Number(a.amount) })
      allocsByItem.set(a.billing_line_item_id, list)
    }
  }

  // --- Group by horse -----------------------------------------------------
  const byHorse = new Map<string, QueueLineItem[]>()

  for (const row of rawItems ?? []) {
    const log = row.log as { logged_at?: string; notes?: string | null } | null
    const sourceKind: QueueLineItem['sourceKind'] =
      row.source_board_service_id       ? 'monthly_board'  :
      row.source_board_service_log_id   ? 'service_log'    :
      row.description?.startsWith('Training Rides — ') ? 'training_ride' :
                                          'ad_hoc'
    const item: QueueLineItem = {
      id:                       row.id,
      description:              row.description,
      quantity:                 Number(row.quantity),
      unitPrice:                Number(row.unit_price),
      total:                    Number(row.total),
      isCredit:                 row.is_credit,
      isAdminAdded:             row.is_admin_added,
      status:                   row.status,
      sourceBoardServiceLogId:  row.source_board_service_log_id,
      sourceBoardServiceId:     row.source_board_service_id,
      sourceKind,
      createdAt:                row.created_at,
      loggedAt:                 log?.logged_at ?? null,
      notes:                    log?.notes ?? null,
      allocations:              allocsByItem.get(row.id) ?? [],
    }
    const list = byHorse.get(row.horse_id) ?? []
    list.push(item)
    byHorse.set(row.horse_id, list)
  }

  // Sort items within each horse: Monthly Board first, then service logs
  // by date logged, then training ride aggregates, then ad-hoc by creation.
  const rankOf = (k: QueueLineItem['sourceKind']) =>
    k === 'monthly_board' ? 0 :
    k === 'service_log'   ? 1 :
    k === 'training_ride' ? 2 :
                            3
  for (const list of byHorse.values()) {
    list.sort((a, b) => {
      const aRank = rankOf(a.sourceKind)
      const bRank = rankOf(b.sourceKind)
      if (aRank !== bRank) return aRank - bRank
      const aWhen = a.loggedAt ?? a.createdAt
      const bWhen = b.loggedAt ?? b.createdAt
      return aWhen.localeCompare(bWhen)
    })
  }

  const horseGroups: HorseGroup[] = eligibleHorses
    .map(h => {
      const items = byHorse.get(h.id) ?? []
      const subtotal = items.reduce((sum, it) => sum + it.total, 0)
      return {
        horseId:             h.id,
        barnName:             h.barnName,
        chargesMonthlyBoard:  h.chargesMonthlyBoard,
        billingContacts:     h.billingContacts,
        items,
        subtotal,
      }
    })
    // Horses that don't charge monthly board only appear if they have
    // something billable this month. Saves space on the queue and avoids
    // implying a Monthly Board should exist where it doesn't.
    .filter(g => g.chargesMonthlyBoard || g.items.length > 0)
    // Surface horses with activity first; those with nothing yet go to the
    // bottom (still visible — admin may want to add ad-hoc charges to them).
    .sort((a, b) => {
      if ((a.items.length > 0) !== (b.items.length > 0)) {
        return a.items.length > 0 ? -1 : 1
      }
      return a.barnName.localeCompare(b.barnName)
    })

  const totalDraft    = horseGroups.flatMap(g => g.items).filter(i => i.status === 'draft').reduce((s, i) => s + i.total, 0)
  const totalReviewed = horseGroups.flatMap(g => g.items).filter(i => i.status === 'reviewed').reduce((s, i) => s + i.total, 0)

  // --- Service catalog for the per-horse + Add service picker ------------
  // Review & Allocate is billing-focused, so the picker only shows billable
  // services. Non-billable services (chronology-only) are logged from the
  // horse profile, where that distinction matters.
  const { data: serviceRows } = await db
    .from('board_service')
    .select('id, name, is_billable, unit_price')
    .eq('is_active', true)
    .eq('is_billable', true)
    .eq('is_recurring_monthly', false)
    .is('deleted_at', null)
    .order('name')

  const services: BoardServiceOption[] = (serviceRows ?? []).map(s => ({
    id:         s.id,
    name:       s.name,
    isBillable: s.is_billable,
    unitPrice:  s.unit_price !== null ? Number(s.unit_price) : null,
  }))

  return {
    horseGroups,
    monthlyBoardServiceId,
    monthlyBoardUnitPrice,
    services,
    totalDraft,
    totalReviewed,
  }
}
