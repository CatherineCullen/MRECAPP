'use client'

import { useState, useTransition } from 'react'
import { addAdHocLineItems } from '../actions'
import type { HorseGroup } from '../_lib/loadQueue'

/**
 * Ad-hoc charge form — one form serves two entry points:
 *
 *   - Per-horse (scopedHorseId set): the horse picker is hidden; the form
 *     is locked to that one horse. This is the common case — "Liam owes me
 *     for a half lease fee," "Taj needs an extra wormer."
 *
 *   - Bulk across horses (top-level, scopedHorseId unset): multi-select
 *     picker defaulting to all checked. This is the wormer case where
 *     every horse needs the same line item — type it once, fan out.
 *
 * The scoped variant is always collapsed by default; the bulk variant has
 * its own collapse toggle on the top button that renders it.
 */
type Props = {
  horseGroups: HorseGroup[]
  scopedHorseId?: string
  onDone?: () => void
}

export default function AddChargeForm({ horseGroups, scopedHorseId, onDone }: Props) {
  const scoped = Boolean(scopedHorseId)

  const [open, setOpen]               = useState(scoped) // scoped form renders already open
  const [description, setDescription] = useState('')
  const [quantity, setQuantity]       = useState('1')
  const [unitPrice, setUnitPrice]     = useState('')
  const [isCredit, setIsCredit]       = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(() =>
    scopedHorseId ? new Set([scopedHorseId]) : new Set(horseGroups.map(g => g.horseId))
  )
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  function selectAll()  { setSelected(new Set(horseGroups.map(g => g.horseId))) }
  function selectNone() { setSelected(new Set()) }

  function reset() {
    setDescription('')
    setQuantity('1')
    setUnitPrice('')
    setIsCredit(false)
    setSelected(scopedHorseId ? new Set([scopedHorseId]) : new Set(horseGroups.map(g => g.horseId)))
    setError(null)
  }

  function handleSubmit() {
    const qtyNum   = Number(quantity)
    const priceNum = Number(unitPrice)
    const horseIds = Array.from(selected)
    setError(null)
    startTransition(async () => {
      const res = await addAdHocLineItems({
        horseIds,
        description,
        quantity:  qtyNum,
        unitPrice: priceNum,
        isCredit,
      })
      if (!res.ok) {
        setError(res.error)
      } else {
        if (scoped) {
          reset()
          onDone?.()
        } else {
          setOpen(false)
          reset()
        }
      }
    })
  }

  // Bulk form: collapsed by default; user clicks the button to open.
  if (!scoped && !open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-white border border-[#c4c6d1] text-[#002058] hover:bg-[#f7f9fc]"
        >
          + Add charge to multiple horses
        </button>
      </div>
    )
  }

  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0)
  const rowCount = selected.size

  return (
    <div className={scoped
      ? 'bg-[#f7f9fc] border-t border-[#e8ecf5] p-3 space-y-2'
      : 'bg-white rounded border border-[#c4c6d1]/40 p-4 space-y-3'
    }>
      <div className="flex items-baseline gap-3">
        <h3 className="text-[#191c1e] font-semibold text-sm">
          {scoped ? 'Add charge' : 'Add charge to multiple horses'}
        </h3>
        {!scoped && (
          <span className="text-xs text-[#8c8e98]">
            {rowCount === 0
              ? 'Pick one or more horses below'
              : rowCount === 1
                ? '1 horse — single line item'
                : `${rowCount} horses — one line per horse`
            }
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (scoped) { reset(); onDone?.() }
            else        { setOpen(false); reset() }
          }}
          disabled={isPending}
          className="text-xs text-[#8c8e98] hover:text-[#444650] disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <label className="text-xs text-[#444650]">
          <span className="block mb-0.5 text-[#8c8e98]">Description</span>
          <input
            type="text"
            value={description}
            placeholder="e.g. Half lease fee"
            onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
          />
        </label>
        <label className="text-xs text-[#444650]">
          <span className="block mb-0.5 text-[#8c8e98]">Qty</span>
          <input
            type="number"
            step="0.001"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-20 px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
          />
        </label>
        <label className="text-xs text-[#444650]">
          <span className="block mb-0.5 text-[#8c8e98]">Unit price</span>
          <input
            type="number"
            step="0.01"
            value={unitPrice}
            placeholder="0.00"
            onChange={e => setUnitPrice(e.target.value)}
            className="w-28 px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#444650]">
        <input
          type="checkbox"
          checked={isCredit}
          onChange={e => setIsCredit(e.target.checked)}
        />
        Credit (negative — reduces their bill)
      </label>

      {/* Bulk mode only — scoped mode hides the picker */}
      {!scoped && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#8c8e98]">Apply to:</span>
            <button type="button" onClick={selectAll}  disabled={isPending} className="text-[#002058] hover:underline disabled:opacity-40">All</button>
            <button type="button" onClick={selectNone} disabled={isPending} className="text-[#002058] hover:underline disabled:opacity-40">None</button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-1 px-2 py-2 bg-[#f7f9fc] rounded border border-[#e8ecf5]">
            {horseGroups.map(g => (
              <label key={g.horseId} className="flex items-center gap-1.5 text-xs text-[#444650] truncate">
                <input
                  type="checkbox"
                  checked={selected.has(g.horseId)}
                  onChange={() => toggle(g.horseId)}
                />
                <span className="truncate">{g.barnName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs pt-1">
        <span className="text-[#8c8e98]">
          {rowCount > 0 && Number.isFinite(total) && (
            <>
              Line total{!scoped && rowCount > 1 ? ' per horse' : ''}:{' '}
              <span className="font-mono text-[#191c1e]">${(total).toFixed(2)}</span>
              {!scoped && rowCount > 1 && (
                <> &middot; <span className="font-mono text-[#191c1e]">${(total * rowCount).toFixed(2)}</span> across {rowCount} horses</>
              )}
            </>
          )}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || rowCount === 0 || !description.trim() || !unitPrice}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
        >
          {isPending ? 'Adding…' : scoped ? 'Add charge' : `Add ${rowCount === 1 ? 'charge' : `${rowCount} charges`}`}
        </button>
      </div>

      {error && <div className="text-xs text-[#8f3434]">{error}</div>}
    </div>
  )
}
