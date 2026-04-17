import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sent invoices history.
 *
 * Everything that's left the Drafts shelf — status in (sent, opened, paid,
 * overdue). The Stripe webhook keeps these in sync: sent → paid on payment,
 * sent → overdue on void / uncollectible.
 *
 * Grouped by billing period (period_end month) in the UI so a year of
 * monthly cycles stays readable. Within a month we sort most-recent first.
 *
 * We link back to the Stripe dashboard by stripe_invoice_id rather than
 * storing hosted_invoice_url — dashboard link works across all statuses and
 * shows the admin the full event log. Customer-facing link isn't useful
 * here (Stripe emails it to the customer).
 */

export type SentInvoiceStatus = 'sent' | 'opened' | 'paid' | 'overdue'

export type SentInvoiceLine = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  isCredit: boolean
  total: number
}

export type SentInvoice = {
  id: string
  stripeInvoiceId: string | null
  status: SentInvoiceStatus
  periodStart: string | null
  periodEnd: string | null
  sentAt: string | null
  paidAt: string | null
  paidMethod: string | null
  dueDate: string | null
  createdAt: string
  billedToId: string
  billedToLabel: string
  total: number
  lines: SentInvoiceLine[]
}

export type SentGroup = {
  /** YYYY-MM key from period_end (or created_at fallback). */
  monthKey: string
  monthLabel: string
  invoices: SentInvoice[]
  total: number
  paidTotal: number
  outstandingTotal: number
}

export type SentSnapshot = {
  groups: SentGroup[]
  /** Across every invoice returned. */
  grandTotal: number
  paidTotal: number
  outstandingTotal: number
}

const ACTIVE_STATUSES: SentInvoiceStatus[] = ['sent', 'opened', 'paid', 'overdue']

export async function loadSent(): Promise<SentSnapshot> {
  const db = createAdminClient()

  const { data: invoices, error: invErr } = await db
    .from('invoice')
    .select(
      'id, stripe_invoice_id, status, period_start, period_end, sent_at, paid_at, paid_method, due_date, billed_to_id, created_at'
    )
    .in('status', ACTIVE_STATUSES)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (invErr) throw new Error(`loadSent: invoice query failed — ${invErr.message}`)
  if (!invoices || invoices.length === 0) {
    return { groups: [], grandTotal: 0, paidTotal: 0, outstandingTotal: 0 }
  }

  // Person labels
  const personIds = Array.from(new Set(invoices.map(i => i.billed_to_id)))
  const { data: persons } = await db
    .from('person')
    .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
    .in('id', personIds)

  const labelFor = (id: string): string => {
    const p = persons?.find(x => x.id === id)
    if (!p) return 'Unknown'
    if (p.is_organization) return p.organization_name ?? 'Unknown org'
    return [p.preferred_name ?? p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
  }

  // Line items
  const invoiceIds = invoices.map(i => i.id)
  const { data: lines, error: linesErr } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, description, quantity, unit_price, is_credit, total')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null)

  if (linesErr) throw new Error(`loadSent: line query failed — ${linesErr.message}`)

  const linesByInvoice = new Map<string, SentInvoiceLine[]>()
  for (const l of lines ?? []) {
    const list = linesByInvoice.get(l.invoice_id) ?? []
    list.push({
      id:          l.id,
      description: l.description,
      quantity:    Number(l.quantity),
      unitPrice:   Number(l.unit_price),
      isCredit:    l.is_credit ?? false,
      total:       Number(l.total),
    })
    linesByInvoice.set(l.invoice_id, list)
  }

  const enriched: SentInvoice[] = invoices.map(inv => {
    const myLines = linesByInvoice.get(inv.id) ?? []
    const total = myLines.reduce((s, l) => s + (l.isCredit ? -l.total : l.total), 0)
    return {
      id:              inv.id,
      stripeInvoiceId: inv.stripe_invoice_id,
      status:          inv.status as SentInvoiceStatus,
      periodStart:     inv.period_start,
      periodEnd:       inv.period_end,
      sentAt:          inv.sent_at,
      paidAt:          inv.paid_at,
      paidMethod:      inv.paid_method,
      dueDate:         inv.due_date,
      createdAt:       inv.created_at,
      billedToId:      inv.billed_to_id,
      billedToLabel:   labelFor(inv.billed_to_id),
      total,
      lines:           myLines,
    }
  })

  // Group by period_end month (falls back to sent_at, then created_at)
  const groupMap = new Map<string, SentInvoice[]>()
  for (const inv of enriched) {
    const key = monthKeyFor(inv)
    const list = groupMap.get(key) ?? []
    list.push(inv)
    groupMap.set(key, list)
  }

  const groups: SentGroup[] = Array.from(groupMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .map(([monthKey, invoices]) => {
      const total = invoices.reduce((s, i) => s + i.total, 0)
      const paidTotal = invoices
        .filter(i => i.status === 'paid')
        .reduce((s, i) => s + i.total, 0)
      const outstandingTotal = total - paidTotal
      return {
        monthKey,
        monthLabel: monthLabelFor(monthKey),
        invoices,
        total,
        paidTotal,
        outstandingTotal,
      }
    })

  const grandTotal = groups.reduce((s, g) => s + g.total, 0)
  const paidTotal = groups.reduce((s, g) => s + g.paidTotal, 0)
  const outstandingTotal = grandTotal - paidTotal

  return { groups, grandTotal, paidTotal, outstandingTotal }
}

function monthKeyFor(inv: SentInvoice): string {
  // Prefer billing period_end — that's what the invoice is "for."
  // Fallback to sent_at, then created_at, so legacy rows still group.
  const iso = inv.periodEnd ?? inv.sentAt ?? inv.createdAt
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}`
}

function monthLabelFor(key: string): string {
  const [y, m] = key.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
