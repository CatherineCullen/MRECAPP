'use client'

import { useState, useTransition } from 'react'
import { markNotContinuing, updateLessonMonthPrice } from '../actions'

type Row = {
  lessonMonthId:    string
  subscriptionId:   string
  riderName:        string
  billedToName:     string
  instructorName:   string
  slotLabel:        string
  subscriptionType: string
  lessonCount:      number
  perLessonPrice:   number
  total:            number | null
  status:           string
  isProrated:       boolean
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function MonthlyBillingTable({ rows }: { rows: Row[] }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Inline price editing for Pending rows. We hold the optimistic
  // per-lesson rate and total locally so the UI updates immediately
  // on save without waiting for the page to revalidate.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<string>('')
  const [overrides, setOverrides] = useState<Record<string, { rate: number; total: number }>>({})

  function startEdit(r: Row) {
    if (r.status !== 'Pending') return
    setError(null)
    setEditingId(r.lessonMonthId)
    setDraft((overrides[r.lessonMonthId]?.rate ?? r.perLessonPrice).toFixed(2))
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft('')
  }

  function saveEdit(lessonMonthId: string) {
    const next = Number(draft)
    if (!Number.isFinite(next) || next < 0) {
      setError('Enter a non-negative number.')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await updateLessonMonthPrice({ lessonMonthId, perLessonPrice: next })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOverrides((o) => ({ ...o, [lessonMonthId]: { rate: next, total: r.newTotal } }))
      setEditingId(null)
      setDraft('')
    })
  }

  if (rows.length === 0) {
    return (
      <div className="border border-[#c4c6d1]/40 rounded-lg p-3 text-xs text-[#444650] bg-white">
        No subscriptions billed this month yet.
      </div>
    )
  }

  function handleNotContinuing(subscriptionId: string, riderName: string) {
    if (!confirm(
      `Mark ${riderName}'s slot as not continuing?\n\n` +
      `This stamps an end date on the slot, soft-deletes pending months from today forward, ` +
      `and removes the corresponding lesson rows. Already-invoiced and paid months are not affected.`,
    )) return

    setError(null)
    setPendingId(subscriptionId)
    startTransition(async () => {
      const result = await markNotContinuing(subscriptionId)
      setPendingId(null)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  return (
    <>
      {error && (
        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="border border-[#c4c6d1]/40 rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f0f2f7] border-b border-[#c4c6d1]/40">
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Rider</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Slot</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Type</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#444650] uppercase tracking-wide">Lessons</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#444650] uppercase tracking-wide">Rate</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#444650] uppercase tracking-wide">Total</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#444650] uppercase tracking-wide">Status</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#444650] uppercase tracking-wide w-44"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c4c6d1]/30">
            {rows.map((r) => {
              const isPending = pending && pendingId === r.subscriptionId
              return (
                <tr key={r.lessonMonthId} className="hover:bg-[#f7f9fc]">
                  <td className="px-3 py-2 text-[#191c1e]">
                    <div>{r.riderName}</div>
                    {r.billedToName !== r.riderName && (
                      <div className="text-[10px] text-[#444650]">Billed to {r.billedToName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#191c1e]">
                    <div>{r.slotLabel}</div>
                    <div className="text-[10px] text-[#444650]">{r.instructorName}</div>
                  </td>
                  <td className="px-3 py-2 text-[#444650] capitalize">{r.subscriptionType}</td>
                  <td className="px-3 py-2 text-right text-[#191c1e] tabular-nums">
                    {r.lessonCount}
                    {r.isProrated && <div className="text-[10px] text-[#7a5a00]">prorated</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-[#444650] tabular-nums">
                    {editingId === r.lessonMonthId ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[#8c8e98]">$</span>
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveEdit(r.lessonMonthId)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="w-20 border border-[#c4c6d1] rounded px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:border-[#002058]"
                        />
                        <button onClick={() => saveEdit(r.lessonMonthId)} disabled={pending} className="text-[10px] text-[#002058] font-semibold hover:underline disabled:opacity-50">Save</button>
                        <button onClick={cancelEdit} className="text-[10px] text-[#444650] hover:underline">×</button>
                      </span>
                    ) : r.status === 'Pending' ? (
                      <button
                        onClick={() => startEdit(r)}
                        className="hover:text-[#191c1e] hover:underline tabular-nums"
                        title="Click to edit per-lesson rate (Pending months only)"
                      >
                        {fmtMoney(overrides[r.lessonMonthId]?.rate ?? r.perLessonPrice)}
                      </button>
                    ) : (
                      <span>{fmtMoney(r.perLessonPrice)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[#191c1e] tabular-nums font-semibold">
                    {(() => {
                      const total = overrides[r.lessonMonthId]?.total ?? r.total
                      return total != null ? fmtMoney(total) : '—'
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide ${
                      r.status === 'Pending'
                        ? 'bg-[#f0f2f7] text-[#444650]'
                        : r.status === 'Invoiced'
                          ? 'bg-[#fff5e0] text-[#7a5a00]'
                          : 'bg-[#e8f0e0] text-[#3a5a1a]'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleNotContinuing(r.subscriptionId, r.riderName)}
                      disabled={isPending}
                      className="text-[11px] font-semibold text-[#8a1a1a] border border-[#ffd6d6] bg-white px-2.5 py-1 rounded hover:bg-[#ffd6d6]/30 disabled:opacity-50 transition-colors whitespace-nowrap"
                      title="Stamp ended_at on the subscription, soft-delete pending future months, and remove their lesson rows. Already-paid months are not affected."
                    >
                      {isPending ? 'Working…' : 'Mark not continuing'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
