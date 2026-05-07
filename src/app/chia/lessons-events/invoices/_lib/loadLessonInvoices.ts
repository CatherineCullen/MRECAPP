import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

// Lesson-invoice loaders.
//
// The Lessons > Invoices tab shows one-off lesson invoices: anything whose
// line items have a lesson-domain source FK (lesson_subscription_id,
// lesson_package_id, event_id). Boarding invoices (board lines only) live
// on a separate queue.
//
// Recurring monthly slot billing under the monthly model (ADR-0019) lives
// on the Monthly Billing tab, not here — those invoices are still lesson-
// domain and will appear in the Sent list below by virtue of having a
// lesson_subscription_id on at least one line.

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
  groupLabel:      string | null
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
    groupLabel:  string
    invoices:    LessonSentInvoice[]
    total:       number
    paid:        number
    outstanding: number
  }>
  grandTotal:       number
  paidTotal:        number
  outstandingTotal: number
}

// Helper — given a list of invoice_line_item rows, return the invoice ids
// that have ANY lesson-domain source FK set on a line item:
//   - lesson_subscription_id (slot subscription line, e.g. monthly billing)
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

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']

function monthLabelFromIso(iso: string | null): { label: string; sortKey: string } {
  if (!iso) return { label: 'Other', sortKey: '0000-00' }
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = d.getMonth()
  return {
    label:   `${MONTH_LABELS[m]} ${y}`,
    sortKey: `${y}-${String(m + 1).padStart(2, '0')}`,
  }
}

export async function loadLessonDrafts(): Promise<LessonDraftsSnapshot> {
  const db = createAdminClient()

  const { data: invoices } = await db
    .from('invoice')
    .select('id, stripe_invoice_id, status, period_start, period_end, created_at, billed_to_id')
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!invoices || invoices.length === 0) return { drafts: [], grandTotal: 0 }

  const lessonIds = await lessonInvoiceIdsFrom(invoices.map(i => i.id))
  const lessonInvoices = invoices.filter(i => lessonIds.has(i.id))
  if (lessonInvoices.length === 0) return { drafts: [], grandTotal: 0 }

  const invoiceIds = lessonInvoices.map(i => i.id)
  const { data: lines } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, description, quantity, unit_price, is_credit, total, lesson_subscription_id')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null)

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

export async function loadLessonSent(): Promise<LessonSentSnapshot> {
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
  const lessonInvoices = invoices.filter(i => lessonIds.has(i.id))
  if (lessonInvoices.length === 0) {
    return { groups: [], grandTotal: 0, paidTotal: 0, outstandingTotal: 0 }
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

  const sentInvoices: LessonSentInvoice[] = lessonInvoices.map(inv => {
    const myLines = linesByInvoice.get(inv.id) ?? []
    const total = myLines.reduce((s, l) => s + (l.isCredit ? -l.total : l.total), 0)
    const { label } = monthLabelFromIso(inv.sent_at ?? inv.created_at)
    return {
      id:              inv.id,
      stripeInvoiceId: inv.stripe_invoice_id,
      status:          inv.status as 'sent' | 'paid' | 'overdue' | 'voided',
      periodStart:     inv.period_start,
      periodEnd:       inv.period_end,
      groupLabel:      label,
      sentAt:          inv.sent_at,
      paidAt:          inv.paid_at,
      paidMethod:      inv.paid_method,
      billedToId:      inv.billed_to_id,
      billedToLabel:   labelFor(inv.billed_to_id),
      total,
      lines:           myLines,
    }
  })

  // Group by sent-month label (or created-month if not yet sent). Voided
  // invoices stay in their group for audit but don't contribute to totals.
  type Group = {
    groupLabel:  string
    invoices:    LessonSentInvoice[]
    total:       number
    paid:        number
    outstanding: number
    sortKey:     string
  }
  const groupsMap = new Map<string, Group>()
  for (const inv of sentInvoices) {
    const { label, sortKey } = monthLabelFromIso(inv.sentAt ?? null)
    let g = groupsMap.get(label)
    if (!g) {
      g = { groupLabel: label, invoices: [], total: 0, paid: 0, outstanding: 0, sortKey }
      groupsMap.set(label, g)
    }
    g.invoices.push(inv)
    if (inv.status !== 'voided') {
      g.total += inv.total
      if (inv.status === 'paid') g.paid += inv.total
      else g.outstanding += inv.total
    }
  }

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
      groupLabel:  g.groupLabel,
      invoices:    g.invoices,
      total:       g.total,
      paid:        g.paid,
      outstanding: g.outstanding,
    }))

  const liveInvoices     = sentInvoices.filter(i => i.status !== 'voided')
  const grandTotal       = liveInvoices.reduce((s, i) => s + i.total, 0)
  const paidTotal        = liveInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstandingTotal = grandTotal - paidTotal

  return { groups, grandTotal, paidTotal, outstandingTotal }
}
