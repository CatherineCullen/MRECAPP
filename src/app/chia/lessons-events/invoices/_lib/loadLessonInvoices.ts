import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

// Lesson-invoice loaders.
//
// The Lessons > Invoices page shows invoices whose line items have at least
// one `lesson_subscription_id` set. This keeps boarding and lessons as two
// separate queues on one `invoice` table — no cross-contamination even though
// both domains share the table.
//
// If we later want camps/packages in the same queue, we'll widen the
// discriminator to "any line item with a lesson-domain source FK."

export type LessonInvoiceLine = {
  id:          string
  description: string
  quantity:    number
  unitPrice:   number
  isCredit:    boolean
  total:       number
  subscriptionId: string | null
}

export type LessonDraftInvoice = {
  id:              string
  stripeInvoiceId: string | null
  status:          'draft'
  periodStart:     string | null
  periodEnd:       string | null
  createdAt:       string
  billedToId:      string
  billedToLabel:   string
  total:           number
  lines:           LessonInvoiceLine[]
}

export type LessonSentInvoice = {
  id:              string
  stripeInvoiceId: string | null
  status:          'sent' | 'paid' | 'overdue' | 'voided'
  periodStart:     string | null
  periodEnd:       string | null
  quarterLabel:    string | null
  sentAt:          string | null
  paidAt:          string | null
  paidMethod:      string | null
  billedToId:      string
  billedToLabel:   string
  total:           number
  lines:           LessonInvoiceLine[]
}

export type LessonDraftsSnapshot = {
  drafts:     LessonDraftInvoice[]
  grandTotal: number
}

export type LessonSentSnapshot = {
  groups: Array<{
    quarterLabel: string
    invoices:     LessonSentInvoice[]
    total:        number
    paid:         number
    outstanding:  number
  }>
  grandTotal:       number
  paidTotal:        number
  outstandingTotal: number
}

// Helper — given a list of invoice_line_item rows, return the invoice ids
// that have ANY lesson-domain source FK set on a line item:
//   - lesson_subscription_id (quarterly recurring)
//   - lesson_package_id      (one-off: evaluation, extra)
//   - event_id               (birthday, clinic, therapy, other)
//
// This is our "this invoice belongs to the lesson domain" discriminator.
// Boarding-only invoices (board service lines, no lesson FKs) don't match,
// which keeps the boarding and lessons queues cleanly separated.
async function lessonInvoiceIdsFrom(invoiceIds: string[]): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set()
  const db = createAdminClient()
  const { data: lines } = await db
    .from('invoice_line_item')
    .select('invoice_id, lesson_subscription_id, lesson_package_id, event_id')
    .in('invoice_id', invoiceIds)
    .or('lesson_subscription_id.not.is.null,lesson_package_id.not.is.null,event_id.not.is.null')
    .is('deleted_at', null)
  return new Set((lines ?? []).map(l => l.invoice_id))
}

// Given a set of invoice ids, return a map: invoice.id → Set<quarter_id> it
// touches. Quarter is resolved per line-item by:
//   - subscription line → subscription.quarter_id
//   - package     line → underlying lesson.scheduled_at falls into which quarter
//                        (fallback: lesson_package.purchased_at when no lesson rows)
//   - event       line → event.scheduled_at falls into which quarter
// Returns empty set for an invoice whose lines don't resolve to any quarter.
async function invoiceQuartersMap(invoiceIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (invoiceIds.length === 0) return out
  const db = createAdminClient()

  const { data: lines } = await db
    .from('invoice_line_item')
    .select('invoice_id, lesson_subscription_id, lesson_package_id, event_id')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null)

  const subIds = [...new Set((lines ?? []).map(l => l.lesson_subscription_id).filter((x): x is string => !!x))]
  const pkgIds = [...new Set((lines ?? []).map(l => l.lesson_package_id).filter((x): x is string => !!x))]
  const evtIds = [...new Set((lines ?? []).map(l => l.event_id).filter((x): x is string => !!x))]

  const [subRes, pkgRes, lrRes, evtRes, qRes] = await Promise.all([
    subIds.length
      ? db.from('lesson_subscription').select('id, quarter_id').in('id', subIds)
      : Promise.resolve({ data: [] as Array<{ id: string; quarter_id: string }> }),
    pkgIds.length
      ? db.from('lesson_package').select('id, purchased_at').in('id', pkgIds)
      : Promise.resolve({ data: [] as Array<{ id: string; purchased_at: string }> }),
    // lesson_rider carries (package_id, lesson_id) — join through to the
    // lesson's scheduled_at to get the actual service date for this package.
    pkgIds.length
      ? db.from('lesson_rider')
          .select('package_id, lesson:lesson ( scheduled_at )')
          .in('package_id', pkgIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ package_id: string | null; lesson: { scheduled_at: string } | null }> }),
    evtIds.length
      ? db.from('event').select('id, scheduled_at').in('id', evtIds)
      : Promise.resolve({ data: [] as Array<{ id: string; scheduled_at: string }> }),
    db.from('quarter').select('id, start_date, end_date').is('deleted_at', null),
  ])

  const subQuarter = new Map((subRes.data ?? []).map(s => [s.id, s.quarter_id]))
  // Package → iso date. Prefer the linked lesson's scheduled date (what
  // actually determines which quarter the service happens in); fall back to
  // lesson_package.purchased_at when the package hasn't been scheduled yet
  // (e.g., bulk package of extras, a couple still unused).
  const pkgPurchased = new Map((pkgRes.data ?? []).map(p => [p.id, p.purchased_at.slice(0, 10)]))
  const pkgLessonDate = new Map<string, string>()
  for (const r of (lrRes.data ?? [])) {
    if (!r.package_id || !r.lesson?.scheduled_at) continue
    const iso = r.lesson.scheduled_at.slice(0, 10)
    const existing = pkgLessonDate.get(r.package_id)
    if (!existing || iso < existing) pkgLessonDate.set(r.package_id, iso)
  }
  const pkgDate = new Map<string, string>()
  for (const id of pkgIds) {
    pkgDate.set(id, pkgLessonDate.get(id) ?? pkgPurchased.get(id) ?? '')
  }
  const evtDate = new Map((evtRes.data ?? []).map(e => [e.id, e.scheduled_at.slice(0, 10)]))

  const quarters = qRes.data ?? []
  function dateToQuarter(iso: string): string | null {
    if (!iso) return null
    for (const q of quarters) {
      if (q.start_date <= iso && q.end_date >= iso) return q.id
    }
    return null
  }

  for (const l of (lines ?? [])) {
    let qid: string | null = null
    if (l.lesson_subscription_id)   qid = subQuarter.get(l.lesson_subscription_id) ?? null
    else if (l.lesson_package_id)   qid = dateToQuarter(pkgDate.get(l.lesson_package_id) ?? '')
    else if (l.event_id)            qid = dateToQuarter(evtDate.get(l.event_id) ?? '')
    if (!qid) continue
    const set = out.get(l.invoice_id) ?? new Set<string>()
    set.add(qid)
    out.set(l.invoice_id, set)
  }
  return out
}

// Resolve the "current active quarter" and the one immediately after, so
// callers can filter invoices by which quarter their linked subs belong to:
//  - 'renewal' scope: subs in next quarter (or later)
//  - 'current' scope: subs in current quarter
//  - 'all'    : no filter
export type InvoiceScope = 'renewal' | 'current' | 'all'

async function currentAndNextQuarterIds(): Promise<{ currentId: string | null; nextIds: Set<string> }> {
  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: all } = await db
    .from('quarter')
    .select('id, start_date, end_date, is_active')
    .is('deleted_at', null)
    .order('start_date')

  const qs = all ?? []
  const current =
    qs.find(q => q.is_active) ??
    qs.find(q => q.start_date <= today && q.end_date >= today) ??
    null
  const currentId = current?.id ?? null

  const nextIds = new Set<string>()
  if (current) {
    for (const q of qs) {
      if (q.start_date > current.end_date) nextIds.add(q.id)
    }
  }
  return { currentId, nextIds }
}

export async function loadLessonDrafts(scope: InvoiceScope = 'all'): Promise<LessonDraftsSnapshot> {
  const db = createAdminClient()

  const { data: invoices } = await db
    .from('invoice')
    .select('id, stripe_invoice_id, status, period_start, period_end, created_at, billed_to_id')
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!invoices || invoices.length === 0) return { drafts: [], grandTotal: 0 }

  const lessonIds = await lessonInvoiceIdsFrom(invoices.map(i => i.id))
  let lessonInvoices = invoices.filter(i => lessonIds.has(i.id))
  if (lessonInvoices.length === 0) return { drafts: [], grandTotal: 0 }

  const invoiceIds = lessonInvoices.map(i => i.id)
  const { data: lines } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, description, quantity, unit_price, is_credit, total, lesson_subscription_id')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null)

  // Scope filtering — for each invoice, resolve the quarter(s) its lines
  // touch (subscription → sub.quarter_id; package/event → date containment
  // against quarter rows) and keep only those that hit the requested bucket.
  if (scope !== 'all') {
    const quartersByInvoice = await invoiceQuartersMap(lessonInvoices.map(i => i.id))
    const { currentId, nextIds } = await currentAndNextQuarterIds()
    lessonInvoices = lessonInvoices.filter(inv => {
      const qids = quartersByInvoice.get(inv.id)
      if (!qids || qids.size === 0) return false
      for (const qid of qids) {
        if (scope === 'renewal' && nextIds.has(qid)) return true
        if (scope === 'current' && qid === currentId) return true
      }
      return false
    })
    if (lessonInvoices.length === 0) return { drafts: [], grandTotal: 0 }
  }

  const personIds = Array.from(new Set(lessonInvoices.map(i => i.billed_to_id)))
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)

  const labelFor = (id: string): string => {
    const p = persons?.find(x => x.id === id)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return displayName(p)
  }

  const visibleInvoiceIds = new Set(lessonInvoices.map(i => i.id))
  const linesByInvoice = new Map<string, LessonInvoiceLine[]>()
  for (const l of lines ?? []) {
    if (!visibleInvoiceIds.has(l.invoice_id)) continue
    const list = linesByInvoice.get(l.invoice_id) ?? []
    list.push({
      id:             l.id,
      description:    l.description,
      quantity:       Number(l.quantity),
      unitPrice:      Number(l.unit_price),
      isCredit:       l.is_credit ?? false,
      total:          Number(l.total),
      subscriptionId: l.lesson_subscription_id,
    })
    linesByInvoice.set(l.invoice_id, list)
  }

  const drafts: LessonDraftInvoice[] = lessonInvoices.map(inv => {
    const myLines = linesByInvoice.get(inv.id) ?? []
    const total = myLines.reduce((s, l) => s + (l.isCredit ? -l.total : l.total), 0)
    return {
      id:              inv.id,
      stripeInvoiceId: inv.stripe_invoice_id,
      status:          'draft' as const,
      periodStart:     inv.period_start,
      periodEnd:       inv.period_end,
      createdAt:       inv.created_at,
      billedToId:      inv.billed_to_id,
      billedToLabel:   labelFor(inv.billed_to_id),
      total,
      lines:           myLines,
    }
  })

  const grandTotal = drafts.reduce((s, d) => s + d.total, 0)
  return { drafts, grandTotal }
}

export async function loadLessonSent(scope: InvoiceScope = 'all'): Promise<LessonSentSnapshot> {
  const db = createAdminClient()

  const { data: invoices } = await db
    .from('invoice')
    .select('id, stripe_invoice_id, status, period_start, period_end, created_at, billed_to_id, sent_at, paid_at, paid_method')
    .in('status', ['sent', 'paid', 'overdue', 'voided'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!invoices || invoices.length === 0) {
    return { groups: [], grandTotal: 0, paidTotal: 0, outstandingTotal: 0 }
  }

  const lessonIds = await lessonInvoiceIdsFrom(invoices.map(i => i.id))
  let lessonInvoices = invoices.filter(i => lessonIds.has(i.id))
  if (lessonInvoices.length === 0) {
    return { groups: [], grandTotal: 0, paidTotal: 0, outstandingTotal: 0 }
  }

  // Scope-by-quarter filter — same shape as loadLessonDrafts, widened to
  // handle package + event lines (not just subscription lines).
  if (scope !== 'all') {
    const quartersByInvoice = await invoiceQuartersMap(lessonInvoices.map(i => i.id))
    const { currentId, nextIds } = await currentAndNextQuarterIds()
    lessonInvoices = lessonInvoices.filter(inv => {
      const qids = quartersByInvoice.get(inv.id)
      if (!qids || qids.size === 0) return false
      for (const qid of qids) {
        if (scope === 'renewal' && nextIds.has(qid)) return true
        if (scope === 'current' && qid === currentId) return true
      }
      return false
    })
    if (lessonInvoices.length === 0) {
      return { groups: [], grandTotal: 0, paidTotal: 0, outstandingTotal: 0 }
    }
  }

  const personIds = Array.from(new Set(lessonInvoices.map(i => i.billed_to_id)))
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)

  const labelFor = (id: string): string => {
    const p = persons?.find(x => x.id === id)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return displayName(p)
  }

  const invoiceIds = lessonInvoices.map(i => i.id)
  const { data: lines } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, description, quantity, unit_price, is_credit, total, lesson_subscription_id')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null)

  const linesByInvoice = new Map<string, LessonInvoiceLine[]>()
  for (const l of lines ?? []) {
    const list = linesByInvoice.get(l.invoice_id) ?? []
    list.push({
      id:             l.id,
      description:    l.description,
      quantity:       Number(l.quantity),
      unitPrice:      Number(l.unit_price),
      isCredit:       l.is_credit ?? false,
      total:          Number(l.total),
      subscriptionId: l.lesson_subscription_id,
    })
    linesByInvoice.set(l.invoice_id, list)
  }

  // Pull the quarter label from the first subscription linked to each invoice
  // so we can group the Sent list by quarter.
  const allSubIds = Array.from(new Set(
    (lines ?? [])
      .map(l => l.lesson_subscription_id)
      .filter((x): x is string => !!x),
  ))
  const { data: subs } = allSubIds.length > 0
    ? await db
        .from('lesson_subscription')
        .select('id, quarter:quarter(id, label, start_date)')
        .in('id', allSubIds)
    : { data: [] }

  const subToQuarter = new Map<string, { label: string; startDate: string }>()
  for (const s of subs ?? []) {
    if (s.quarter) subToQuarter.set(s.id, { label: s.quarter.label, startDate: s.quarter.start_date })
  }

  const invoiceQuarter = (invoiceId: string): { label: string; startDate: string } | null => {
    const myLines = linesByInvoice.get(invoiceId) ?? []
    for (const l of myLines) {
      if (l.subscriptionId) {
        const q = subToQuarter.get(l.subscriptionId)
        if (q) return q
      }
    }
    return null
  }

  const sentInvoices: LessonSentInvoice[] = lessonInvoices.map(inv => {
    const myLines = linesByInvoice.get(inv.id) ?? []
    const total = myLines.reduce((s, l) => s + (l.isCredit ? -l.total : l.total), 0)
    const q = invoiceQuarter(inv.id)
    return {
      id:              inv.id,
      stripeInvoiceId: inv.stripe_invoice_id,
      status:          inv.status as 'sent' | 'paid' | 'overdue' | 'voided',
      periodStart:     inv.period_start,
      periodEnd:       inv.period_end,
      quarterLabel:    q?.label ?? null,
      sentAt:          inv.sent_at,
      paidAt:          inv.paid_at,
      paidMethod:      inv.paid_method,
      billedToId:      inv.billed_to_id,
      billedToLabel:   labelFor(inv.billed_to_id),
      total,
      lines:           myLines,
    }
  })

  // Group by quarter label. Invoices missing a quarter label (shouldn't
  // happen in normal flow) fall into 'Other'.
  type Group = { quarterLabel: string; invoices: LessonSentInvoice[]; total: number; paid: number; outstanding: number; sortKey: string }
  const groupsMap = new Map<string, Group>()
  for (const inv of sentInvoices) {
    const label = inv.quarterLabel ?? 'Other'
    const sortKey = (() => {
      for (const l of inv.lines) {
        if (l.subscriptionId) {
          const q = subToQuarter.get(l.subscriptionId)
          if (q) return q.startDate
        }
      }
      return '0000-00-00'
    })()
    let g = groupsMap.get(label)
    if (!g) {
      g = { quarterLabel: label, invoices: [], total: 0, paid: 0, outstanding: 0, sortKey }
      groupsMap.set(label, g)
    }
    g.invoices.push(inv)
    // Voided invoices are visible for audit trail but don't contribute to
    // billed / paid / outstanding totals — they're a cancellation, not a bill.
    if (inv.status !== 'voided') {
      g.total += inv.total
      if (inv.status === 'paid') g.paid += inv.total
      else g.outstanding += inv.total
    }
  }

  // Within each group, push voided invoices to the bottom so live invoices
  // read first, voided audit rows sit underneath.
  for (const g of groupsMap.values()) {
    g.invoices.sort((a, b) => {
      const av = a.status === 'voided' ? 1 : 0
      const bv = b.status === 'voided' ? 1 : 0
      return av - bv
    })
  }

  const groups = Array.from(groupsMap.values())
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map(g => ({
      quarterLabel: g.quarterLabel,
      invoices:     g.invoices,
      total:        g.total,
      paid:         g.paid,
      outstanding:  g.outstanding,
    }))

  const liveInvoices     = sentInvoices.filter(i => i.status !== 'voided')
  const grandTotal       = liveInvoices.reduce((s, i) => s + i.total, 0)
  const paidTotal        = liveInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstandingTotal = grandTotal - paidTotal

  return { groups, grandTotal, paidTotal, outstandingTotal }
}
