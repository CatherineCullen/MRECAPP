import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

/**
 * Billing Review queue loader.
 *
 * Always-on model: on page load, we (1) seed any missing Monthly Board rows
 * for active boarder horses, (2) seed billing_line_item rows for any reviewed
 * board_service_log that hasn't been staged yet, and (3) load the current
 * open queue for rendering.
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
  sourceKind: 'monthly_board' | 'service_log' | 'ad_hoc'
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
      id, barn_name,
      contacts:horse_contact (
        id, person_id, is_billing_contact, deleted_at,
        person:person ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      )
    `)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  const eligibleHorses = (horses ?? [])
    .map(h => {
      const billingContacts: BillingContactOpt[] = (h.contacts ?? [])
        .filter((c: { deleted_at: string | null }) => c.deleted_at === null)
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
        billingContacts,
      }
    })
    // Horse is eligible iff it has at least one default-flagged contact.
    // Zero-default horses are silently skipped so admin notices the missing
    // flag; any contacts on the horse with default=false still participate
    // in allocation once the horse is eligible.
    .filter(h => h.billingContacts.some(c => c.isDefault))

  // --- Seed Monthly Board rows where missing ------------------------------
  // One Monthly Board row per horse per calendar month. Gate: if we've
  // already created (or soft-deleted) a Monthly Board for this horse at
  // any point in the current calendar month, don't seed another. This
  // means an April Generate doesn't spawn May's board on the next page
  // visit — May will appear once the calendar rolls over.
  //
  // Deleted rows count too: if admin deleted this month's board for a
  // horse as a mistake, we don't resurrect it.
  if (monthlyBoardServiceId && monthlyBoardUnitPrice !== null && eligibleHorses.length > 0) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data: existingMonthly } = await db
      .from('billing_line_item')
      .select('horse_id')
      .eq('source_board_service_id', monthlyBoardServiceId)
      .gte('created_at', monthStart)

    const haveMonthly = new Set((existingMonthly ?? []).map(r => r.horse_id))
    const missingFor = eligibleHorses.filter(h => !haveMonthly.has(h.id))

    if (missingFor.length > 0) {
      const toInsert = missingFor.map(h => ({
        horse_id:                h.id,
        description:             'Monthly Board',
        quantity:                1,
        unit_price:              monthlyBoardUnitPrice,
        is_credit:               false,
        is_admin_added:          false,
        source_board_service_id: monthlyBoardServiceId,
        status:                  'draft' as const,
      }))
      // Don't await error on conflict — each row is independent and a
      // concurrent insert (e.g., admin refreshing twice fast) is harmless.
      await db.from('billing_line_item').insert(toInsert)
    }
  }

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

  // --- Load existing allocations for these items --------------------------
  const itemIds = (rawItems ?? []).map(r => r.id)
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
      row.source_board_service_id       ? 'monthly_board' :
      row.source_board_service_log_id   ? 'service_log'   :
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
  // by date logged, then ad-hoc by creation date.
  for (const list of byHorse.values()) {
    list.sort((a, b) => {
      const aRank = a.sourceKind === 'monthly_board' ? 0 : a.sourceKind === 'service_log' ? 1 : 2
      const bRank = b.sourceKind === 'monthly_board' ? 0 : b.sourceKind === 'service_log' ? 1 : 2
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
        horseId:         h.id,
        barnName:        h.barnName,
        billingContacts: h.billingContacts,
        items,
        subtotal,
      }
    })
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
