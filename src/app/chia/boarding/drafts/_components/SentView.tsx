'use client'

import { useState } from 'react'
import type { SentSnapshot, SentInvoice, SentInvoiceStatus } from '../_lib/loadSent'

/**
 * Sent invoices history.
 *
 * Grouped by billing period month — current month expanded by default,
 * older months collapsed to keep a year's worth of cycles readable.
 * Click a group header to toggle. Status chip per row; dashboard link
 * opens the Stripe-side view where the admin can see full event history
 * and trigger refunds / manual payments if needed.
 *
 * No actions here (beyond "open in Stripe"). The Stripe webhook keeps
 * status in sync — paying out-of-band in the dashboard fires
 * invoice.paid, which flips CHIA to paid automatically.
 */

function fmt(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `($${abs})` : `$${abs}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Stripe surfaces payment method types as lowercase snake_case strings.
// Map the common ones to friendlier labels; fall back to title-casing
// anything unknown so Stripe-added methods still render sensibly.
const METHOD_LABELS: Record<string, string> = {
  card:             'Card',
  us_bank_account:  'ACH',
  link:             'Link',
  cashapp:          'Cash App',
  out_of_band:      'Out of band',
}
function fmtMethod(m: string | null): string {
  if (!m) return ''
  if (METHOD_LABELS[m]) return METHOD_LABELS[m]
  return m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const STATUS_CHIP: Record<SentInvoiceStatus, { label: string; bg: string; fg: string }> = {
  sent:    { label: 'Sent',    bg: 'bg-[#dae2ff]',      fg: 'text-[#002058]' },
  opened:  { label: 'Opened',  bg: 'bg-[#dae2ff]',      fg: 'text-[#002058]' },
  paid:    { label: 'Paid',    bg: 'bg-[#d9ecd9]',      fg: 'text-[#1e5128]' },
  overdue: { label: 'Overdue', bg: 'bg-[#f9d9d9]',      fg: 'text-[#8f3434]' },
}

function StatusChip({ status }: { status: SentInvoiceStatus }) {
  const s = STATUS_CHIP[status]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${s.bg} ${s.fg} text-[10px] font-semibold uppercase tracking-wide`}>
      {s.label}
    </span>
  )
}

function InvoiceRow({ invoice }: { invoice: SentInvoice }) {
  const [expanded, setExpanded] = useState(false)
  const stripeUrl = invoice.stripeInvoiceId
    ? `https://dashboard.stripe.com/invoices/${invoice.stripeInvoiceId}`
    : null

  return (
    <div className="border-t border-[#e8ecf5] first:border-t-0">
      <div className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="text-[#8c8e98] hover:text-[#444650] text-xs w-3 flex-shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="text-[#191c1e] font-semibold flex-1 truncate">{invoice.billedToLabel}</span>
        <StatusChip status={invoice.status} />
        <div className="text-xs text-[#8c8e98] w-36 text-right leading-tight">
          <div>
            {invoice.status === 'paid'
              ? `Paid ${fmtDate(invoice.paidAt)}`
              : `Sent ${fmtDate(invoice.sentAt)}`}
          </div>
          {invoice.status === 'paid' && invoice.paidMethod && (
            <div className="text-[10px] text-[#8c8e98]/80">{fmtMethod(invoice.paidMethod)}</div>
          )}
        </div>
        <span className={`font-mono text-sm font-semibold w-24 text-right ${
          invoice.status === 'paid' ? 'text-[#1e5128]' :
          invoice.status === 'overdue' ? 'text-[#8f3434]' :
          'text-[#191c1e]'
        }`}>
          {fmt(invoice.total)}
        </span>
        <a
          href={`/chia/invoices/${invoice.id}`}
          target="_blank"
          rel="noopener"
          className="text-xs text-[#002058] hover:underline flex-shrink-0"
        >
          Details ↗
        </a>
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#002058] hover:underline flex-shrink-0"
          >
            Stripe ↗
          </a>
        )}
      </div>

      {expanded && invoice.lines.length > 0 && (
        <div className="bg-[#f7f9fc] px-4 py-2 border-t border-[#e8ecf5]">
          <div className="divide-y divide-[#e8ecf5]/60">
            {invoice.lines.map(l => (
              <div key={l.id} className="flex items-baseline gap-2 py-1 text-xs">
                <span className="text-[#444650] flex-1 truncate">{l.description}</span>
                {l.quantity !== 1 && (
                  <span className="font-mono text-[#8c8e98] text-[10px]">
                    {l.quantity} × ${l.unitPrice.toFixed(2)}
                  </span>
                )}
                <span className={`font-mono ${l.isCredit ? 'text-[#8f3434]' : 'text-[#444650]'}`}>
                  {fmt(l.isCredit ? -l.total : l.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SentView({ snapshot }: { snapshot: SentSnapshot }) {
  const { groups, grandTotal, paidTotal, outstandingTotal } = snapshot

  // Default: current month expanded, older collapsed. Stored by monthKey
  // so toggling is per-group.
  const nowKey = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    // Open the newest group by default even if it's not the current
    // calendar month (e.g. viewing in January, newest is December).
    if (groups.length > 0) out[groups[0].monthKey] = true
    if (!out[nowKey]) out[nowKey] = true
    return out
  })

  if (groups.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-xl p-4 text-sm text-[#444650]">
          No invoices sent yet. Send from the Drafts tab — they'll appear here once finalized.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Summary strip */}
      <div className="flex items-center gap-6 px-4 py-3 bg-white rounded border border-[#c4c6d1]/40">
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Invoices</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">
            {groups.reduce((s, g) => s + g.invoices.length, 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Billed</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">{fmt(grandTotal)}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Paid</div>
          <div className="font-mono text-base text-[#1e5128] font-semibold">{fmt(paidTotal)}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Outstanding</div>
          <div className={`font-mono text-base font-semibold ${outstandingTotal > 0.005 ? 'text-[#8f3434]' : 'text-[#8c8e98]'}`}>
            {fmt(outstandingTotal)}
          </div>
        </div>
      </div>

      {/* Month groups */}
      <div className="space-y-3">
        {groups.map(group => {
          const isOpen = openGroups[group.monthKey] ?? false
          return (
            <section key={group.monthKey} className="bg-white rounded border border-[#c4c6d1]/40">
              <button
                type="button"
                onClick={() => setOpenGroups(s => ({ ...s, [group.monthKey]: !isOpen }))}
                className="w-full flex items-baseline gap-3 px-4 py-2.5 bg-[#f7f9fc] rounded-t border-b border-[#c4c6d1]/40 hover:bg-[#eef1f8]"
              >
                <span className="text-[#8c8e98] text-xs w-3 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                <h3 className="text-[#191c1e] font-semibold text-sm flex-1 text-left">{group.monthLabel}</h3>
                <span className="text-xs text-[#8c8e98]">{group.invoices.length} invoice{group.invoices.length === 1 ? '' : 's'}</span>
                {group.outstandingTotal > 0.005 && (
                  <span className="text-xs text-[#8f3434] font-mono">
                    {fmt(group.outstandingTotal)} outstanding
                  </span>
                )}
                <span className="font-mono text-sm text-[#191c1e] font-semibold w-24 text-right">
                  {fmt(group.total)}
                </span>
              </button>

              {isOpen && (
                <div>
                  {group.invoices.map(inv => (
                    <InvoiceRow key={inv.id} invoice={inv} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
