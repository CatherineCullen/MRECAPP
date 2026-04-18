'use client'

import { useState, useTransition } from 'react'
import type { LessonDraftsSnapshot, LessonDraftInvoice } from '../_lib/loadLessonInvoices'
import { sendLessonDraftInvoice, discardLessonDraftInvoice } from '../actions'

// Lesson drafts — same Draft → Send / Discard rhythm as boarding, but without
// the multi-invoice cascade (lesson invoices aren't shared across people).

function fmt(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `($${abs})` : `$${abs}`
}

type RowStatus =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; hostedInvoiceUrl: string | null }
  | { state: 'discarding' }
  | { state: 'error'; message: string }

function DraftCard({
  draft, status, onSend, onDiscard,
}: {
  draft:    LessonDraftInvoice
  status:   RowStatus
  onSend:   () => void
  onDiscard:() => void
}) {
  const busy = status.state === 'sending' || status.state === 'discarding'
  const done = status.state === 'sent'
  const stripeUrl = draft.stripeInvoiceId
    ? `https://dashboard.stripe.com/invoices/${draft.stripeInvoiceId}`
    : null

  return (
    <section className={`bg-white rounded border border-[#c4c6d1]/40 ${done ? 'opacity-60' : ''}`}>
      <header className="flex items-baseline gap-3 px-4 py-2.5 bg-[#f7f9fc] rounded-t border-b border-[#c4c6d1]/40">
        <h3 className="text-[#191c1e] font-semibold text-sm truncate flex-1">{draft.billedToLabel}</h3>
        <span className="font-mono text-sm text-[#191c1e] font-semibold">{fmt(draft.total)}</span>
      </header>

      <div className="divide-y divide-[#e8ecf5]">
        {draft.lines.map(l => (
          <div key={l.id} className="flex items-baseline gap-2 px-4 py-1.5 text-xs">
            <span className="text-[#191c1e] flex-1 truncate">{l.description}</span>
            <span className="font-mono text-[#191c1e]">{fmt(l.total)}</span>
          </div>
        ))}
      </div>

      <footer className="flex items-center gap-2 px-4 py-2 border-t border-[#e8ecf5] bg-[#fafbfd] rounded-b">
        {stripeUrl && (
          <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#002058] hover:underline">
            Preview in Stripe ↗
          </a>
        )}
        <div className="flex-1" />
        {status.state === 'error' && (
          <span className="text-xs text-[#8f3434] truncate" title={status.message}>{status.message}</span>
        )}
        {status.state === 'sent' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#002058]/10 text-[#002058] text-[10px] font-semibold uppercase tracking-wide">
            Sent
          </span>
        )}
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy || done}
          className="text-xs text-[#8f3434] hover:text-[#7a2a2a] disabled:opacity-30"
        >
          {status.state === 'discarding' ? 'Discarding…' : 'Discard'}
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={busy || done}
          className="px-3 py-1 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-30"
        >
          {status.state === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </footer>
    </section>
  )
}

export default function LessonDraftsView({ snapshot }: { snapshot: LessonDraftsSnapshot }) {
  const { drafts, grandTotal } = snapshot
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})
  const [isBatching, startBatch]  = useTransition()
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  const status = (id: string): RowStatus => rowStatus[id] ?? { state: 'idle' }

  async function sendOne(draft: LessonDraftInvoice) {
    setRowStatus(s => ({ ...s, [draft.id]: { state: 'sending' } }))
    const res = await sendLessonDraftInvoice({ invoiceId: draft.id })
    setRowStatus(s => ({
      ...s,
      [draft.id]: res.ok
        ? { state: 'sent', hostedInvoiceUrl: res.hostedInvoiceUrl }
        : { state: 'error', message: res.error },
    }))
  }

  async function discardOne(draft: LessonDraftInvoice) {
    const subCount = draft.lines.filter(l => l.subscriptionId).length
    const msg = subCount > 0
      ? `Discard the draft for ${draft.billedToLabel}? ${subCount} pending subscription${subCount === 1 ? '' : 's'} will return to the Renewal tab for re-invoicing.`
      : `Discard the draft for ${draft.billedToLabel}?`
    if (!confirm(msg)) return

    setRowStatus(s => ({ ...s, [draft.id]: { state: 'discarding' } }))
    const res = await discardLessonDraftInvoice({ invoiceId: draft.id })
    if (!res.ok) {
      setRowStatus(s => ({ ...s, [draft.id]: { state: 'error', message: res.error } }))
    }
  }

  function sendAll() {
    const pending = drafts.filter(d => status(d.id).state === 'idle')
    if (pending.length === 0) return
    setBatchProgress({ done: 0, total: pending.length })
    startBatch(async () => {
      for (let i = 0; i < pending.length; i++) {
        await sendOne(pending[i])
        setBatchProgress({ done: i + 1, total: pending.length })
      }
    })
  }

  if (drafts.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-xl p-4 text-sm text-[#444650]">
          No draft invoices. Go to <strong>Renewal</strong>, Create Pending for the next quarter,
          then click <strong>Generate Invoices</strong> to create drafts here.
        </div>
      </div>
    )
  }

  const pendingCount = drafts.filter(d => status(d.id).state === 'idle').length
  const sentCount    = drafts.filter(d => status(d.id).state === 'sent').length
  const errorCount   = drafts.filter(d => status(d.id).state === 'error').length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-6 px-4 py-3 bg-white rounded border border-[#c4c6d1]/40">
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Drafts</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">{drafts.length}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Total</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">{fmt(grandTotal)}</div>
        </div>
        {(sentCount > 0 || errorCount > 0) && (
          <>
            <div className="h-8 w-px bg-[#c4c6d1]/60" />
            {sentCount > 0 && (
              <div>
                <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Sent</div>
                <div className="font-mono text-base text-[#002058] font-semibold">{sentCount}</div>
              </div>
            )}
            {errorCount > 0 && (
              <div>
                <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Failed</div>
                <div className="font-mono text-base text-[#8f3434] font-semibold">{errorCount}</div>
              </div>
            )}
          </>
        )}
        <div className="flex-1" />
        {batchProgress && (
          <span className="text-xs text-[#444650]">
            {isBatching
              ? `Sending ${batchProgress.done} of ${batchProgress.total}…`
              : `Batch done: ${batchProgress.done} of ${batchProgress.total}`}
          </span>
        )}
        <button
          type="button"
          onClick={sendAll}
          disabled={isBatching || pendingCount === 0}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
        >
          {isBatching ? 'Sending…' : `Send all (${pendingCount})`}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {drafts.map(d => (
          <DraftCard key={d.id} draft={d} status={status(d.id)} onSend={() => sendOne(d)} onDiscard={() => discardOne(d)} />
        ))}
      </div>
    </div>
  )
}
