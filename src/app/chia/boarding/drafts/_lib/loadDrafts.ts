import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Drafts view data — the second half of the monthly workflow.
 *
 * After Generate Invoices runs, CHIA invoices exist in status='draft' with a
 * stripe_invoice_id pointing at the Stripe-side draft. Admin reviews each
 * one (using the Stripe hosted preview) and either Sends (finalize + email)
 * or Discards (void on Stripe + soft-delete here + unstamp the sources so
 * they flow back into the open queue).
 *
 * We keep the UI snappy by loading everything the page needs in one round
 * trip: invoice row + billed-to display name + line-item rollup + count.
 */

export type DraftLine = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  isCredit: boolean
  total: number
}

export type DraftInvoice = {
  id: string
  stripeInvoiceId: string | null
  status: 'draft'
  periodStart: string | null
  periodEnd: string | null
  createdAt: string
  billedToId: string
  billedToLabel: string
  total: number
  lines: DraftLine[]
}

export type DraftsSnapshot = {
  drafts: DraftInvoice[]
  grandTotal: number
}

// Returns the subset of invoice IDs that have at least one lesson-domain line
// item (subscription, package, or event). Used to exclude lesson invoices from
// the boarding queue — the lesson section already applies the same logic as its
// own positive filter, so both queues stay clean without a source column.
async function lessonInvoiceIds(db: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await db
    .from('invoice_line_item')
    .select('invoice_id')
    .in('invoice_id', ids)
    .or('lesson_subscription_id.not.is.null,lesson_package_id.not.is.null,event_id.not.is.null')
    .is('deleted_at', null)
  return new Set((data ?? []).map(l => l.invoice_id))
}

export async function loadDrafts(): Promise<DraftsSnapshot> {
  const db = createAdminClient()

  // 1. Draft invoice rows. Soft-deleted rows stay hidden.
  const { data: invoices, error: invErr } = await db
    .from('invoice')
    .select('id, stripe_invoice_id, status, period_start, period_end, created_at, billed_to_id')
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (invErr) throw new Error(`loadDrafts: invoice query failed — ${invErr.message}`)
  if (!invoices || invoices.length === 0) return { drafts: [], grandTotal: 0 }

  // 2. Exclude lesson-domain invoices — this is the boarding queue only.
  const lessonIds = await lessonInvoiceIds(db, invoices.map(i => i.id))
  const boardingInvoices = invoices.filter(i => !lessonIds.has(i.id))
  if (boardingInvoices.length === 0) return { drafts: [], grandTotal: 0 }

  // 3. Person labels for the billed_to column. Single query, client-side map.
  const personIds = Array.from(new Set(boardingInvoices.map(i => i.billed_to_id)))
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

  // 4. Line items, grouped client-side.
  const invoiceIds = boardingInvoices.map(i => i.id)
  const { data: lines, error: linesErr } = await db
    .from('invoice_line_item')
    .select('id, invoice_id, description, quantity, unit_price, is_credit, total')
    .in('invoice_id', invoiceIds)
    .is('deleted_at', null)

  if (linesErr) throw new Error(`loadDrafts: line query failed — ${linesErr.message}`)

  const linesByInvoice = new Map<string, DraftLine[]>()
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

  const drafts: DraftInvoice[] = boardingInvoices.map(inv => {
    const myLines = linesByInvoice.get(inv.id) ?? []
    // Credits stored with is_credit=true and a positive unit_price; they
    // subtract from the invoice total. Match that convention here so the
    // roll-up matches what Stripe shows.
    const total = myLines.reduce((s, l) => s + (l.isCredit ? -l.total : l.total), 0)
    return {
      id:              inv.id,
      stripeInvoiceId: inv.stripe_invoice_id,
      status:          'draft',
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
