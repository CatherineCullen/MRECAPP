'use client'

import { useState, useTransition } from 'react'
import { approveLineItem, unApproveLineItem, deleteLineItem, editLineItem } from '../actions'
import type { QueueLineItem, BillingContactOpt } from '../_lib/loadQueue'

/**
 * Per-item allocation + edit + delete UI.
 *
 * Three modes share the expand slot:
 *   - 'allocate' — grid of per-contact amount inputs (multi-contact horses)
 *   - 'edit'     — edit the item itself (description/qty/price for ad-hoc;
 *                  price-only override for service_log / monthly_board)
 *   - null       — collapsed row
 *
 * Single-contact horses skip the allocate mode entirely (one-click Approve).
 * Reviewed items are not editable/deletable here — admin Undoes first.
 */

type Props = {
  item: QueueLineItem
  billingContacts: BillingContactOpt[]
}

type Mode = 'allocate' | 'edit' | null

function fmt(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `($${abs})` : `$${abs}`
}

// Display-only date formatter — avoids TZ wobble by reading the date
// portion of the ISO string directly. Service logs are dates, not
// timestamps with meaningful clock-of-day to admin.
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function AllocateRow({ item, billingContacts }: Props) {
  const [mode, setMode] = useState<Mode>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const defaults = billingContacts.filter(c => c.isDefault)
  const isAdHoc  = item.sourceKind === 'ad_hoc'

  // ---- Allocation input state ------------------------------------------
  // Inputs are percentages (0-100). Storage is still dollars per
  // allocation (ADR-0014 sum-to-total invariant, cents matter for
  // reconciliation) — we convert on save with remainder-to-first-row.
  //
  // Tolerance: any sum in [99, 101] is accepted. That lets admin type
  // 33 / 33 / 33 for a three-way split without backing out the math to
  // 33.33 / 33.33 / 33.34 — we proportionally distribute the exact cents.
  // 50 / 50 passes trivially; 50 / 30 (sum 80) is rejected.
  //
  // Pre-fill: existing allocations back-compute percentages from the
  // dollars. New items split evenly across default-flagged contacts.
  const itemCents = Math.round(item.total * 100)

  const initialInputs: Record<string, string> = (() => {
    const out: Record<string, string> = {}
    if (item.allocations.length > 0 && itemCents !== 0) {
      for (const c of billingContacts) {
        const existing = item.allocations.find(a => a.personId === c.personId)
        if (existing) {
          const pct = (Number(existing.amount) / Number(item.total)) * 100
          out[c.horseContactId] = Number.isFinite(pct) ? Number(pct.toFixed(2)).toString() : ''
        } else {
          out[c.horseContactId] = ''
        }
      }
      return out
    }
    if (defaults.length > 0) {
      const per = Math.floor(100 / defaults.length)
      const remainder = 100 - per * defaults.length
      for (const c of billingContacts) out[c.horseContactId] = ''
      defaults.forEach((c, i) => {
        out[c.horseContactId] = (per + (i === 0 ? remainder : 0)).toString()
      })
    } else {
      for (const c of billingContacts) out[c.horseContactId] = ''
    }
    return out
  })()
  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs)

  const parsed = billingContacts.map(c => ({
    contact: c,
    pct:     Number(inputs[c.horseContactId] ?? '0') || 0,
  }))
  const sumPct = parsed.reduce((s, p) => s + p.pct, 0)
  const sumsCorrectly = sumPct >= 99 && sumPct <= 101

  // Proportional conversion to cents. Preview the dollars per row live so
  // admin can spot a wrong entry before saving. Remainder cents — i.e.
  // anything lost to rounding — lands on the first non-zero row so the
  // sum always equals item.total exactly.
  function percentagesToAllocations(): Array<{ personId: string; amount: number }> {
    if (sumPct === 0) return []
    const raw = parsed.map(p => ({
      personId: p.contact.personId,
      cents:    Math.round((p.pct / sumPct) * itemCents),
    }))
    const diff = itemCents - raw.reduce((s, r) => s + r.cents, 0)
    const firstNonZero = raw.findIndex(r => r.cents !== 0)
    if (firstNonZero >= 0) raw[firstNonZero].cents += diff
    return raw.filter(r => r.cents !== 0).map(r => ({ personId: r.personId, amount: r.cents / 100 }))
  }

  const previewAllocs = percentagesToAllocations()
  const previewByPerson = new Map(previewAllocs.map(a => [a.personId, a.amount]))

  // ---- Edit form state --------------------------------------------------
  const [editDesc, setEditDesc]   = useState(item.description)
  const [editQty,  setEditQty ]   = useState(item.quantity.toString())
  const [editPrice, setEditPrice] = useState(item.unitPrice.toFixed(2))
  const [editCredit, setEditCredit] = useState(item.isCredit)

  function splitEvenly() {
    if (billingContacts.length === 0) return
    // Distribute 100% across all contacts. Whole-number percentages where
    // possible (50/50, 25/25/25/25); otherwise fractional with remainder
    // on the first row (33.34/33.33/33.33 for a three-way). The remainder-
    // to-first-row rule in percentagesToAllocations keeps the dollar sum
    // exact regardless.
    const N = billingContacts.length
    const per = Math.floor(10000 / N) / 100     // two-decimal percentage floor
    const remainder = Number((100 - per * N).toFixed(2))
    const next: Record<string, string> = {}
    billingContacts.forEach((c, i) => {
      const pct = per + (i === 0 ? remainder : 0)
      next[c.horseContactId] = Number(pct.toFixed(2)).toString()
    })
    setInputs(next)
    setError(null)
  }

  function doApprove(allocs: Array<{ personId: string; amount: number }>) {
    setError(null)
    startTransition(async () => {
      const res = await approveLineItem({ itemId: item.id, allocations: allocs })
      if (!res.ok) setError(res.error)
      else         setMode(null)
    })
  }

  function handleApproveClick() {
    // Fast path: horse has literally one contact → one-click allocate 100%.
    if (billingContacts.length === 1) {
      doApprove([{ personId: billingContacts[0].personId, amount: item.total }])
      return
    }
    setMode('allocate')
  }

  function handleSubmitAllocation() {
    if (!sumsCorrectly) return
    doApprove(percentagesToAllocations())
  }

  function handleUnApprove() {
    setError(null)
    startTransition(async () => {
      const res = await unApproveLineItem({ itemId: item.id })
      if (!res.ok) setError(res.error)
    })
  }

  function handleDelete() {
    if (!window.confirm('Delete this line item? This cannot be undone.')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteLineItem({ itemId: item.id })
      if (!res.ok) setError(res.error)
    })
  }

  function handleSaveEdit() {
    const qtyNum   = Number(editQty)
    const priceNum = Number(editPrice)
    setError(null)
    startTransition(async () => {
      const payload: Parameters<typeof editLineItem>[0] = { itemId: item.id }
      if (isAdHoc) {
        payload.description = editDesc
        payload.quantity    = qtyNum
        payload.unitPrice   = priceNum
        payload.isCredit    = editCredit
      } else {
        payload.unitPrice   = priceNum
      }
      const res = await editLineItem(payload)
      if (!res.ok) setError(res.error)
      else         setMode(null)
    })
  }

  // -------- Render -------------------------------------------------------

  if (item.status === 'reviewed') {
    return (
      <div className="border-t border-[#e8ecf5] first:border-t-0">
        <div className="flex items-start gap-3 px-3 py-2 text-sm">
          <SourceChip kind={item.sourceKind} />
          <div className="flex-1 min-w-0">
            <div className="text-[#191c1e]">{item.description}</div>
            <MetaLine item={item} />
            <div className="mt-0.5 text-xs text-[#8c8e98] space-y-0.5">
              {item.allocations.map(a => {
                const c = billingContacts.find(c => c.personId === a.personId)
                return (
                  <div key={a.id} className="flex gap-2">
                    <span className="truncate">{c?.label ?? 'Unknown'}</span>
                    <span className="font-mono">{fmt(a.amount)}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#002058]/10 text-[#002058] text-[10px] font-semibold uppercase tracking-wide">
            Reviewed
          </span>
          <div className={`w-24 text-right font-mono text-sm ${item.total < 0 ? 'text-[#8f3434]' : 'text-[#191c1e]'}`}>
            {fmt(item.total)}
          </div>
          <button
            type="button"
            onClick={handleUnApprove}
            disabled={isPending}
            className="text-xs text-[#8c8e98] hover:text-[#8f3434] disabled:opacity-40"
            title="Move back to Draft"
          >
            Undo
          </button>
        </div>
        {error && (
          <div className="px-3 pb-2 text-xs text-[#8f3434]">{error}</div>
        )}
      </div>
    )
  }

  // Draft row ------------------------------------------------------------
  return (
    <div className="border-t border-[#e8ecf5] first:border-t-0">
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        <SourceChip kind={item.sourceKind} />
        <div className="flex-1 min-w-0">
          <div className="text-[#191c1e] truncate">{item.description}</div>
          <MetaLine item={item} />
          {item.quantity !== 1 && (
            <div className="text-xs text-[#8c8e98]">
              {item.quantity} × {fmt(item.unitPrice)}
            </div>
          )}
        </div>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#f3a712]/15 text-[#7a5408] text-[10px] font-semibold uppercase tracking-wide">
          Draft
        </span>
        <div className={`w-24 text-right font-mono text-sm ${item.total < 0 ? 'text-[#8f3434]' : 'text-[#191c1e]'}`}>
          {fmt(item.total)}
        </div>
        {mode ? (
          <button
            type="button"
            onClick={() => { setMode(null); setError(null) }}
            disabled={isPending}
            className="text-xs text-[#8c8e98] hover:text-[#444650] disabled:opacity-40"
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setMode('edit'); setError(null) }}
              disabled={isPending}
              className="text-xs text-[#8c8e98] hover:text-[#002058] disabled:opacity-40"
              title="Edit line item"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-[#8c8e98] hover:text-[#8f3434] disabled:opacity-40"
              title="Delete line item"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleApproveClick}
              disabled={isPending || billingContacts.length === 0}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
            >
              {billingContacts.length === 1 ? 'Approve' : 'Allocate…'}
            </button>
          </>
        )}
      </div>

      {mode === 'allocate' && (
        <div className="px-3 pb-3 pt-1 bg-[#f7f9fc] space-y-2">
          <div className="space-y-1">
            {billingContacts.map(c => (
              <div key={c.horseContactId} className="flex items-center gap-2">
                <label className="flex-1 text-xs text-[#444650] truncate flex items-center gap-1.5" htmlFor={`a-${item.id}-${c.horseContactId}`}>
                  <span className="truncate">{c.label}</span>
                  {c.isDefault && (
                    <span className="text-[9px] uppercase tracking-wide text-[#002058]/60 font-semibold flex-shrink-0">Default</span>
                  )}
                </label>
                <input
                  id={`a-${item.id}-${c.horseContactId}`}
                  type="number"
                  step="0.01"
                  value={inputs[c.horseContactId] ?? ''}
                  onChange={e => {
                    setInputs(prev => ({ ...prev, [c.horseContactId]: e.target.value }))
                    setError(null)
                  }}
                  className="w-16 px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058] text-right"
                />
                <span className="text-xs text-[#8c8e98] w-3">%</span>
                <span className="font-mono text-xs text-[#8c8e98] w-20 text-right">
                  {previewByPerson.get(c.personId) !== undefined ? fmt(previewByPerson.get(c.personId) as number) : '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={splitEvenly}
              disabled={isPending}
              className="text-[#002058] hover:underline disabled:opacity-40"
            >
              Split evenly
            </button>
            <div className="flex-1" />
            <span className={`font-mono ${sumsCorrectly ? 'text-[#8c8e98]' : 'text-[#8f3434]'}`}>
              Sum: {Number(sumPct.toFixed(2))}%
              {!sumsCorrectly && (
                <> &middot; needs 100%</>
              )}
            </span>
            <button
              type="button"
              onClick={handleSubmitAllocation}
              disabled={isPending || !sumsCorrectly}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
            >
              Approve
            </button>
          </div>

          {error && <div className="text-xs text-[#8f3434]">{error}</div>}
        </div>
      )}

      {mode === 'edit' && (
        <div className="px-3 pb-3 pt-1 bg-[#f7f9fc] space-y-2">
          {isAdHoc ? (
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
              <label className="text-xs text-[#444650]">
                <span className="block mb-0.5 text-[#8c8e98]">Description</span>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
                />
              </label>
              <label className="text-xs text-[#444650]">
                <span className="block mb-0.5 text-[#8c8e98]">Qty</span>
                <input
                  type="number"
                  step="0.001"
                  value={editQty}
                  onChange={e => setEditQty(e.target.value)}
                  className="w-20 px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
                />
              </label>
              <label className="text-xs text-[#444650]">
                <span className="block mb-0.5 text-[#8c8e98]">Unit price</span>
                <input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className="w-28 px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
                />
              </label>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <label className="text-xs text-[#444650]">
                <span className="block mb-0.5 text-[#8c8e98]">Unit price override</span>
                <input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className="w-28 px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
                />
              </label>
              <div className="text-xs text-[#8c8e98] pb-1.5 flex-1">
                Description and quantity are tied to the source {item.sourceKind === 'monthly_board' ? 'catalog rate' : 'service log'} and aren&rsquo;t editable here.
              </div>
            </div>
          )}

          {isAdHoc && (
            <label className="flex items-center gap-2 text-xs text-[#444650]">
              <input
                type="checkbox"
                checked={editCredit}
                onChange={e => setEditCredit(e.target.checked)}
              />
              Credit (reduces total)
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isPending}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
            >
              Save
            </button>
          </div>

          {error && <div className="text-xs text-[#8f3434]">{error}</div>}
        </div>
      )}

      {!mode && error && (
        <div className="px-3 pb-2 text-xs text-[#8f3434]">{error}</div>
      )}
    </div>
  )
}

function MetaLine({ item }: { item: QueueLineItem }) {
  // Service logs carry both a logged date and a free-text note. Monthly
  // Board and ad-hoc have neither — the meta line is hidden for them.
  if (item.sourceKind !== 'service_log') return null
  if (!item.loggedAt && !item.notes) return null
  return (
    <div className="text-xs text-[#8c8e98] truncate">
      {item.loggedAt && <span>{fmtDate(item.loggedAt)}</span>}
      {item.loggedAt && item.notes && <span> &middot; </span>}
      {item.notes && <span title={item.notes}>{item.notes}</span>}
    </div>
  )
}

function SourceChip({ kind }: { kind: QueueLineItem['sourceKind'] }) {
  const base = 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0'
  switch (kind) {
    case 'monthly_board':
      return <span className={`${base} bg-[#dae2ff] text-[#002058]`}>Monthly Board</span>
    case 'service_log':
      return <span className={`${base} bg-[#e8ecf5] text-[#444650]`}>Service log</span>
    case 'ad_hoc':
      return <span className={`${base} bg-[#fef3e7] text-[#7a5408]`}>Ad hoc</span>
  }
}
