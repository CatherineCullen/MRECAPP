'use client'

import { useState, useTransition } from 'react'
import type { LessonSentSnapshot, LessonSentInvoice } from '../_lib/loadLessonInvoices'
import { voidAndCancelLessonInvoice } from '../actions'

// Sent lesson invoices, grouped by quarter. Each row is one household's
// quarterly bundle. Expand to see line items. Void & Cancel button on
// sent/overdue rows (paid invoices show a refund hint instead).

function fmt(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `($${abs})` : `$${abs}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMethod(m: string | null): string {
  if (!m) return '—'
  if (m === 'card') return 'Card'
  if (m === 'us_bank_account') return 'ACH'
  if (m === 'link') return 'Link'
  if (m === 'cashapp') return 'Cash App'
  if (m === 'out_of_band') return 'Out of band'
  return m
}

function StatusChip({ status }: { status: 'sent' | 'paid' | 'overdue' | 'voided' }) {
  if (status === 'paid') {
    return <span className="inline-flex px-1.5 py-0.5 rounded bg-[#1a6f3a]/10 text-[#1a6f3a] text-[10px] font-semibold uppercase tracking-wide">Paid</span>
  }
  if (status === 'overdue') {
    return <span className="inline-flex px-1.5 py-0.5 rounded bg-[#8f3434]/10 text-[#8f3434] text-[10px] font-semibold uppercase tracking-wide">Overdue</span>
  }
  if (status === 'voided') {
    return <span className="inline-flex px-1.5 py-0.5 rounded bg-[#8c8e98]/10 text-[#8c8e98] text-[10px] font-semibold uppercase tracking-wide">Voided</span>
  }
  return <span className="inline-flex px-1.5 py-0.5 rounded bg-[#002058]/10 text-[#002058] text-[10px] font-semibold uppercase tracking-wide">Sent</span>
}

function InvoiceRow({ inv }: { inv: LessonSentInvoice }) {
  const [expanded, setExpanded] = useState(false)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const stripeUrl = inv.stripeInvoiceId
    ? `https://dashboard.stripe.com/invoices/${inv.stripeInvoiceId}`
    : null

  const canVoid = inv.status === 'sent' || inv.status === 'overdue'
  // (Voided invoices keep their row for audit, but no action button.)

  function handleVoidAndCancel() {
    const subLines = inv.lines.filter(l => l.subscriptionId)
    const msg = subLines.length === 0
      ? `Void the invoice for ${inv.billedToLabel}? This cannot be undone.`
      : `Void the invoice for ${inv.billedToLabel} and cancel ${subLines.length} pending subscription${subLines.length === 1 ? '' : 's'}? This cannot be undone.`
    if (!confirm(msg)) return

    setError(null)
    startTransition(async () => {
      const res = await voidAndCancelLessonInvoice({ invoiceId: inv.id })
      if (!res.ok) setError(res.error)
    })
  }

  const isVoided = inv.status === 'voided'

  return (
    <div className={`border-b border-[#e8ecf5] last:border-b-0 ${isVoided ? 'bg-[#f7f9fc] text-[#8c8e98]' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-2 text-xs">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[#8c8e98] hover:text-[#191c1e] w-4"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold truncate ${isVoided ? 'text-[#8c8e98] line-through decoration-[#8c8e98]/40' : 'text-[#191c1e]'}`}>
            {inv.billedToLabel}
          </div>
        </div>
        <StatusChip status={inv.status} />
        <span className="text-[#8c8e98] w-24 truncate">
          {inv.status === 'paid' ? fmtDate(inv.paidAt) : fmtDate(inv.sentAt)}
        </span>
        <span className="text-[#8c8e98] w-20 truncate">{fmtMethod(inv.paidMethod)}</span>
        <span className={`font-mono font-semibold w-24 text-right ${isVoided ? 'text-[#8c8e98] line-through decoration-[#8c8e98]/40' : 'text-[#191c1e]'}`}>
          {fmt(inv.total)}
        </span>
        <div className="w-52 flex items-center justify-end gap-2">
          <a href={`/chia/invoices/${inv.id}`} target="_blank" rel="noopener" className="text-[#002058] hover:underline">
            Details ↗
          </a>
          {stripeUrl && (
            <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="text-[#002058] hover:underline">
              Stripe ↗
            </a>
          )}
          {canVoid && (
            <button
              onClick={handleVoidAndCancel}
              disabled={busy}
              className="text-[#8f3434] hover:underline disabled:opacity-40"
            >
              {busy ? 'Voiding…' : 'Void & cancel'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="px-8 pb-2 text-xs text-[#8f3434]">{error}</div>
      )}
      {expanded && (
        <div className="px-8 pb-2 pt-1 space-y-1">
          {inv.lines.map(l => (
            <div key={l.id} className="flex items-baseline gap-2 text-[11px]">
              <span className="text-[#444650] flex-1 truncate">{l.description}</span>
              <span className="font-mono text-[#444650]">{fmt(l.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LessonSentView({ snapshot }: { snapshot: LessonSentSnapshot }) {
  const { groups, grandTotal, paidTotal, outstandingTotal } = snapshot
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // Default: newest group expanded
    const s = new Set<string>()
    if (groups.length > 0) s.add(groups[0].quarterLabel)
    return s
  })

  function toggle(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-xl p-4 text-sm text-[#444650]">
          No sent lesson invoices yet.
        </div>
      </div>
    )
  }

  const invoiceCount = groups.reduce((s, g) => s + g.invoices.length, 0)

  return (
    <div className="p-6 space-y-4">
      {/* Summary strip */}
      <div className="flex items-center gap-6 px-4 py-3 bg-white rounded border border-[#c4c6d1]/40">
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Invoices</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">{invoiceCount}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Billed</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">{fmt(grandTotal)}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Paid</div>
          <div className="font-mono text-base text-[#1a6f3a] font-semibold">{fmt(paidTotal)}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Outstanding</div>
          <div className="font-mono text-base text-[#8f3434] font-semibold">{fmt(outstandingTotal)}</div>
        </div>
      </div>

      {groups.map(g => {
        const open = openGroups.has(g.quarterLabel)
        return (
          <div key={g.quarterLabel} className="bg-white rounded border border-[#c4c6d1]/40">
            <button
              onClick={() => toggle(g.quarterLabel)}
              className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#f7f9fc] rounded-t border-b border-[#c4c6d1]/40 hover:bg-[#f0f2f6]"
            >
              <span className="text-[#8c8e98] w-4 text-left">{open ? '▾' : '▸'}</span>
              <h3 className="text-[#191c1e] font-semibold text-sm flex-1 text-left">{g.quarterLabel}</h3>
              <span className="text-xs text-[#8c8e98]">{g.invoices.length} invoice{g.invoices.length === 1 ? '' : 's'}</span>
              <span className="font-mono text-sm text-[#191c1e] font-semibold w-24 text-right">{fmt(g.total)}</span>
            </button>
            {open && (
              <div>
                {g.invoices.map(inv => <InvoiceRow key={inv.id} inv={inv} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
