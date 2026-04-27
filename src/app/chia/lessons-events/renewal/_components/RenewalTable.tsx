'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RenewalPreviewRow } from '../../_lib/quarterlyRenewal'
import { createPendingSubscriptions, markNotRenewing, markRenewing, resetNextQuarterRenewal } from '../actions'
import { generateLessonSubscriptionInvoices } from '../../invoices/actions'

// The renewal table. Renewing rows up top (most common case), Not Renewing
// rows below in a muted style. Checkboxes on renewing rows that don't already
// have a pending sub for next quarter drive the bulk "Create Pending" button.
//
// The column set is deliberately tight — this is a scanning view. Drill into
// the subscription itself from the rider name column for anything heavier.

function formatTime(t: string): string {
  // Incoming 'HH:MM:SS' or 'HH:MM' → '4:30 PM'
  const [h, m] = t.split(':').map(Number)
  const h12 = h % 12 || 12
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type Props = {
  rows:                    RenewalPreviewRow[]
  nextQuarterId:           string | null
  nextQuarterLabel:        string | null
  readyCount:              number
  canCreate:               boolean
  pendingUninvoicedCount:  number
}

export default function RenewalTable({
  rows, nextQuarterId, nextQuarterLabel, readyCount, canCreate, pendingUninvoicedCount,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Default-check every "ready" renewing row
    const s = new Set<string>()
    for (const r of rows) {
      if (r.renewalIntent === 'renewing' && !r.alreadyPending) s.add(r.sourceSubscriptionId)
    }
    return s
  })
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const renewing    = useMemo(() => rows.filter(r => r.renewalIntent === 'renewing'),   [rows])
  const notRenewing = useMemo(() => rows.filter(r => r.renewalIntent === 'not_renewing'), [rows])

  const readyRows = useMemo(() => renewing.filter(r => !r.alreadyPending), [renewing])
  const allReadySelected = readyRows.length > 0 && readyRows.every(r => selected.has(r.sourceSubscriptionId))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allReadySelected) {
        for (const r of readyRows) next.delete(r.sourceSubscriptionId)
      } else {
        for (const r of readyRows) next.add(r.sourceSubscriptionId)
      }
      return next
    })
  }

  function handleCreate() {
    setError(null)
    setToast(null)
    const ids = Array.from(selected)
    if (ids.length === 0) {
      setError('Select at least one row.')
      return
    }
    startTransition(async () => {
      const res = await createPendingSubscriptions(ids)
      if (res.error) {
        setError(res.error)
        return
      }
      const bits: string[] = []
      if (res.created > 0) bits.push(`${res.created} pending subscription${res.created === 1 ? '' : 's'} created`)
      if (res.skipped > 0) bits.push(`${res.skipped} skipped (already pending)`)
      setToast(bits.join(' · ') || 'Nothing to do.')
    })
  }

  function handleNotRenewing(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await markNotRenewing(id)
      if (res.error) setError(res.error)
    })
  }

  function handleRenewing(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await markRenewing(id)
      if (res.error) setError(res.error)
    })
  }

  function handleReset() {
    if (!confirm('Wipe ALL pending subs, lessons, and invoices for next quarter, and reset every rider to Renewing? Paid invoices stay. This is a dev-only reset.')) return
    setError(null)
    setToast(null)
    startTransition(async () => {
      const res = await resetNextQuarterRenewal()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setToast(
        `Reset done — voided ${res.voidedInvoices}, discarded ${res.deletedDrafts} drafts, cleared ${res.softDeletedSubs} subs / ${res.softDeletedLessons} lessons, reset ${res.resetIntents} intents.`,
      )
      router.refresh()
    })
  }

  function handleGenerateInvoices() {
    if (!nextQuarterId) return
    setError(null)
    setToast(null)
    startTransition(async () => {
      const res = await generateLessonSubscriptionInvoices({ quarterId: nextQuarterId })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const okCount   = res.results.filter(r => r.ok).length
      const failCount = res.results.filter(r => !r.ok).length
      const bits: string[] = []
      if (okCount > 0)   bits.push(`${okCount} invoice${okCount === 1 ? '' : 's'} generated`)
      if (failCount > 0) bits.push(`${failCount} failed`)
      setToast(bits.join(' · ') || 'Nothing to invoice.')
      // Drafts live on the Invoices sub-tab now — navigate there so admin
      // sees what they just created rather than refreshing this roster in
      // place. Roster data is fine as-is since the bulk action only creates
      // invoice rows; it doesn't change the roster state.
      if (okCount > 0) router.push('/chia/lessons-events/renewal/invoices')
    })
  }

  return (
    <div>
      <p className="text-xs text-[#444650] mb-2">
        Checked rows will be added to the <strong>{nextQuarterLabel ?? 'next quarter'}</strong> calendar as pending subscriptions.
        Uncheck to hold off (row stays renewing, but nothing is scheduled yet).
        Use <strong>Not renewing</strong> to move a rider out entirely.
      </p>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button
          onClick={handleCreate}
          disabled={!canCreate || isPending || selected.size === 0}
          className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Working…'
            : `Add ${selected.size} to ${nextQuarterLabel ?? 'next quarter'} calendar`}
        </button>
        {pendingUninvoicedCount > 0 && (
          <button
            onClick={handleGenerateInvoices}
            disabled={isPending}
            className="bg-white border border-[#002058] text-[#002058] text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#f0f2f6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate Invoices ({pendingUninvoicedCount})
          </button>
        )}
        {readyCount > 0 && (
          <span className="text-xs text-[#444650]">
            {readyCount} row{readyCount === 1 ? '' : 's'} ready to clone
          </span>
        )}
        {toast && <span className="text-xs text-[#1a6f3a]">{toast}</span>}
        {error && <span className="text-xs text-[#8f3434]">{error}</span>}
        <button
          onClick={handleReset}
          disabled={isPending}
          className="ml-auto text-xs text-[#8f3434] border border-[#8f3434] hover:bg-[#fdecec] rounded px-2 py-1 font-semibold disabled:opacity-40"
          title="Dev-only: wipe next-quarter state so you can start over"
        >
          Reset next quarter (dev)
        </button>
      </div>

      <div className="bg-white rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#f0f2f6] text-[#444650]">
            <tr>
              <th className="text-left px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allReadySelected}
                  onChange={toggleAll}
                  disabled={readyRows.length === 0}
                  aria-label="Select all ready rows"
                />
              </th>
              <th className="text-left px-3 py-2 font-semibold">Rider</th>
              <th className="text-left px-3 py-2 font-semibold">Slot</th>
              <th className="text-left px-3 py-2 font-semibold">Instructor</th>
              <th className="text-left px-3 py-2 font-semibold">Type</th>
              <th className="text-right px-3 py-2 font-semibold">Price</th>
              <th className="text-left px-3 py-2 font-semibold">Next quarter</th>
              <th className="text-right px-3 py-2 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {renewing.map(r => (
              <tr key={r.sourceSubscriptionId} className="border-t border-[#ecedf2]">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.sourceSubscriptionId)}
                    onChange={() => toggle(r.sourceSubscriptionId)}
                    disabled={r.alreadyPending}
                    aria-label={`Select ${r.riderName}`}
                  />
                </td>
                <td className="px-3 py-2 font-medium text-[#191c1e]">{r.riderName}</td>
                <td className="px-3 py-2 text-[#444650]">
                  {capitalize(r.lessonDay)} {formatTime(r.lessonTime)}
                </td>
                <td className="px-3 py-2 text-[#444650]">{r.instructorName}</td>
                <td className="px-3 py-2 text-[#444650]">{capitalize(r.subscriptionType)}</td>
                <td className="px-3 py-2 text-right text-[#444650]">${r.subscriptionPrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-[#444650]">
                  {r.alreadyPending
                    ? pendingStateLabel(r.pendingInvoiceStatus)
                    : <span className="text-[#98a0af]">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleNotRenewing(r.sourceSubscriptionId)}
                    disabled={isPending}
                    className="text-xs text-[#8f3434] border border-[#8f3434] hover:bg-[#fdecec] rounded px-2 py-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Not renewing
                  </button>
                </td>
              </tr>
            ))}
            {renewing.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[#98a0af]">
                  No renewing subscriptions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {notRenewing.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wide mb-2">
            Not renewing ({notRenewing.length})
          </h3>
          <div className="bg-white rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {notRenewing.map(r => (
                  <tr key={r.sourceSubscriptionId} className="border-t border-[#ecedf2] text-[#98a0af]">
                    <td className="px-3 py-2 w-8"></td>
                    <td className="px-3 py-2 font-medium">{r.riderName}</td>
                    <td className="px-3 py-2">
                      {capitalize(r.lessonDay)} {formatTime(r.lessonTime)}
                    </td>
                    <td className="px-3 py-2">{r.instructorName}</td>
                    <td className="px-3 py-2">{capitalize(r.subscriptionType)}</td>
                    <td className="px-3 py-2 text-right">${r.subscriptionPrice.toFixed(2)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleRenewing(r.sourceSubscriptionId)}
                        disabled={isPending}
                        className="text-xs text-[#002058] border border-[#002058] hover:bg-[#f0f2f6] rounded px-2 py-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Undo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function pendingStateLabel(status: 'draft' | 'sent' | 'paid' | 'overdue' | null): React.ReactNode {
  if (status === 'paid')    return <span className="text-[#1a6f3a] font-semibold">Paid</span>
  if (status === 'sent')    return <span className="text-[#002058] font-semibold">Invoiced</span>
  if (status === 'overdue') return <span className="text-[#8f3434] font-semibold">Overdue</span>
  if (status === 'draft')   return <span className="text-[#444650]">Draft invoice</span>
  return <span className="text-[#444650]">Pending (no invoice)</span>
}
