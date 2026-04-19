import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

// Neutral invoice detail page — both boarding and lessons-events invoices
// live in the same `invoice` table, so we serve one place that shows
// everything we know about a given invoice. Linked from the sent/drafts
// views, the person detail page, and anywhere else an invoice appears.

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft:   { label: 'Draft',   cls: 'bg-[#fff4d6] text-[#7a5a00]' },
  sent:    { label: 'Sent',    cls: 'bg-[#dae2ff] text-[#002058]' },
  paid:    { label: 'Paid',    cls: 'bg-[#b7f0d0] text-[#1a6b3c]' },
  overdue: { label: 'Overdue', cls: 'bg-[#ffd6d6] text-[#8a1a1a]' },
  voided:  { label: 'Voided',  cls: 'bg-[#e8edf4] text-[#444650]' },
}

const METHOD_LABEL: Record<string, string> = {
  card:             'Card',
  us_bank_account:  'ACH',
  link:             'Link',
  cashapp:          'Cash App',
  out_of_band:      'Out of band',
}

// Short label for the line item source. When we have a detail page for that
// source, we also return a link href.
function lineItemSourceHint(l: LineItem): { label: string; href?: string } | null {
  if (l.lesson_subscription_id) return { label: 'Subscription' }
  if (l.lesson_package_id)      return { label: 'Package' }
  if (l.camp_enrollment_id)     return { label: 'Camp enrollment' }
  if (l.board_service_log_id)   return { label: 'Service log' }
  if (l.board_service_id)       return { label: 'Monthly board' }
  if (l.event_id)               return { label: 'Event', href: `/chia/lessons-events/events/${l.event_id}` }
  if (l.training_ride_id)       return { label: 'Training ride' }
  if (l.adjustment_for_id)      return { label: 'Adjustment' }
  return null
}

type LineItem = {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  is_credit: boolean
  is_admin_added: boolean
  line_item_type: string
  adjustment_for_id: string | null
  board_service_log_id: string | null
  lesson_subscription_id: string | null
  lesson_package_id: string | null
  camp_enrollment_id: string | null
  board_service_id: string | null
  event_id: string | null
  training_ride_id: string | null
  horse: { id: string; barn_name: string } | null
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `($${abs})` : `$${abs}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Date-only strings: avoid TZ drift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: invoice, error: invErr }, { data: lines, error: linesErr }] = await Promise.all([
    supabase
      .from('invoice')
      .select(`
        id, status, period_start, period_end, due_date, stripe_invoice_id,
        notes, sent_at, paid_at, paid_method, created_at, updated_at,
        billed_to:person!invoice_billed_to_id_fkey
          ( id, first_name, last_name, preferred_name ),
        creator:person!invoice_created_by_fkey
          ( id, first_name, last_name, preferred_name )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('invoice_line_item')
      .select(`
        id, description, quantity, unit_price, total,
        is_credit, is_admin_added, line_item_type,
        adjustment_for_id, board_service_log_id, lesson_subscription_id,
        lesson_package_id, camp_enrollment_id, board_service_id, event_id,
        training_ride_id,
        horse:horse ( id, barn_name )
      `)
      .eq('invoice_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  if (invErr) throw invErr
  if (linesErr) throw linesErr
  if (!invoice) notFound()

  const grandTotal = (lines ?? []).reduce((s, l) => s + Number(l.total), 0)
  const statusMeta = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.draft
  const stripeUrl  = invoice.stripe_invoice_id
    ? `https://dashboard.stripe.com/invoices/${invoice.stripe_invoice_id}`
    : null

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link href="/chia" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← CHIA
        </Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h2 className="text-lg font-bold text-[#191c1e]">Invoice</h2>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
          {stripeUrl && (
            <a
              href={stripeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#002058] hover:underline"
            >
              Stripe ↗
            </a>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-xs">
          <dt className="text-[#444650] font-semibold">Billed to</dt>
          <dd className="text-[#191c1e]">
            {invoice.billed_to?.id ? (
              <Link
                href={`/chia/people/${invoice.billed_to.id}`}
                target="_blank"
                rel="noopener"
                className="hover:underline hover:text-[#002058]"
                title="Open profile in new tab"
              >
                {displayName(invoice.billed_to)}
              </Link>
            ) : displayName(invoice.billed_to)}
          </dd>

          {(invoice.period_start || invoice.period_end) && (
            <>
              <dt className="text-[#444650] font-semibold">Period</dt>
              <dd className="text-[#191c1e]">
                {fmtDate(invoice.period_start)} – {fmtDate(invoice.period_end)}
              </dd>
            </>
          )}

          {invoice.due_date && (
            <>
              <dt className="text-[#444650] font-semibold">Due</dt>
              <dd className="text-[#191c1e]">{fmtDate(invoice.due_date)}</dd>
            </>
          )}

          <dt className="text-[#444650] font-semibold">Created</dt>
          <dd className="text-[#191c1e]">
            {fmtDateTime(invoice.created_at)}
            {invoice.creator && (
              <span className="text-[#444650]"> by {displayName(invoice.creator)}</span>
            )}
          </dd>

          {invoice.sent_at && (
            <>
              <dt className="text-[#444650] font-semibold">Sent</dt>
              <dd className="text-[#191c1e]">{fmtDateTime(invoice.sent_at)}</dd>
            </>
          )}

          {invoice.paid_at && (
            <>
              <dt className="text-[#444650] font-semibold">Paid</dt>
              <dd className="text-[#191c1e]">
                {fmtDateTime(invoice.paid_at)}
                {invoice.paid_method && (
                  <span className="text-[#444650]"> · {METHOD_LABEL[invoice.paid_method] ?? invoice.paid_method}</span>
                )}
              </dd>
            </>
          )}

          {invoice.stripe_invoice_id && (
            <>
              <dt className="text-[#444650] font-semibold">Stripe ID</dt>
              <dd className="text-[#191c1e] font-mono text-[11px]">{invoice.stripe_invoice_id}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Notes — typed field, shown prominently when present */}
      {invoice.notes && (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
          <h3 className="text-sm font-bold text-[#191c1e] mb-2">Notes</h3>
          <p className="text-xs text-[#191c1e] whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Line items */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 overflow-hidden mb-4">
        <div className="px-4 py-2 bg-[#f7f9fc] border-b border-[#c4c6d1]/30 flex items-center">
          <h3 className="text-sm font-bold text-[#191c1e] flex-1">Line items</h3>
          <span className="text-xs text-[#444650]">
            {(lines ?? []).length} {(lines ?? []).length === 1 ? 'item' : 'items'}
          </span>
        </div>
        {(lines ?? []).length === 0 ? (
          <p className="px-4 py-6 text-xs text-[#444650] text-center">No line items on this invoice.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#c4c6d1]/30 text-left">
                <th className="py-2 px-3 font-semibold text-[#444650]">Description</th>
                <th className="py-2 px-3 font-semibold text-[#444650] text-right w-16">Qty</th>
                <th className="py-2 px-3 font-semibold text-[#444650] text-right w-24">Unit</th>
                <th className="py-2 px-3 font-semibold text-[#444650] text-right w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map(l => {
                const src = lineItemSourceHint(l as LineItem)
                return (
                  <tr key={l.id} className="border-b border-[#c4c6d1]/20 align-top">
                    <td className="py-1.5 px-3 text-[#191c1e]">
                      <div>{l.description}</div>
                      <div className="text-[10px] text-[#444650] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {src && (
                          src.href ? (
                            <Link href={src.href} className="text-[#002058] hover:underline">{src.label}</Link>
                          ) : (
                            <span>{src.label}</span>
                          )
                        )}
                        {l.horse && (
                          <>
                            <span className="text-[#c4c6d1]">·</span>
                            <Link
                              href={`/chia/herd/horses/${l.horse.id}`}
                              target="_blank"
                              rel="noopener"
                              className="text-[#002058] hover:underline"
                            >
                              {l.horse.barn_name}
                            </Link>
                          </>
                        )}
                        {l.is_admin_added && (
                          <>
                            <span className="text-[#c4c6d1]">·</span>
                            <span className="text-[#7a5a00]">admin added</span>
                          </>
                        )}
                        {l.is_credit && (
                          <>
                            <span className="text-[#c4c6d1]">·</span>
                            <span className="text-[#1a6b3c]">credit</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-right text-[#444650]">{Number(l.quantity)}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-[#444650]">{fmtMoney(Number(l.unit_price))}</td>
                    <td className="py-1.5 px-3 text-right font-mono font-semibold text-[#191c1e]">{fmtMoney(Number(l.total))}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#f7f9fc]">
                <td colSpan={3} className="py-2 px-3 text-right text-xs font-semibold text-[#444650]">Total</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-sm text-[#191c1e]">{fmtMoney(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
