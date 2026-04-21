'use client'

import { useState, useTransition, useMemo } from 'react'
import { addMonthlyBoardLineItems } from '../actions'
import type { HorseGroup } from '../_lib/loadQueue'

/**
 * Monthly Board entry — replaces the old auto-seed. Admin clicks the
 * button, sees every monthly-board horse pre-checked with the next month's
 * label and the catalog rate pre-filled, and posts in one go.
 *
 * Default month is next month: barn bills board ahead, so adding board in
 * April should default to "Monthly Board - May 2026".
 *
 * Pre-check rule: horse.charges_monthly_board === true. Barn-owned and
 * free-lease horses (chargesMonthlyBoard=false) are visible but unchecked
 * — admin can still add for them as a one-off if needed.
 *
 * Duplicate guard is a soft warning, not a block: any horse that already
 * has an open Monthly Board line in the queue is flagged so admin can
 * uncheck them before submitting.
 */
type Props = {
  horseGroups:    HorseGroup[]
  unitPriceHint:  number | null   // from board_service catalog
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function defaultMonthLabel(): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `Monthly Board - ${MONTHS[next.getMonth()]} ${next.getFullYear()}`
}

export default function AddMonthlyBoardForm({ horseGroups, unitPriceHint }: Props) {
  const [open, setOpen]               = useState(false)
  const [description, setDescription] = useState(defaultMonthLabel())
  const [unitPrice, setUnitPrice]     = useState(unitPriceHint !== null ? unitPriceHint.toFixed(2) : '')
  const [selected, setSelected]       = useState<Set<string>>(
    () => new Set(horseGroups.filter(g => g.chargesMonthlyBoard).map(g => g.horseId))
  )
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // Horses already carrying an open Monthly Board line — soft warning only.
  const alreadyHasBoard = useMemo(() => {
    const s = new Set<string>()
    for (const g of horseGroups) {
      if (g.items.some(it => it.sourceKind === 'monthly_board')) s.add(g.horseId)
    }
    return s
  }, [horseGroups])

  const dupSelectedCount = useMemo(
    () => Array.from(selected).filter(id => alreadyHasBoard.has(id)).length,
    [selected, alreadyHasBoard],
  )

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  function selectDefault() {
    setSelected(new Set(horseGroups.filter(g => g.chargesMonthlyBoard).map(g => g.horseId)))
  }
  function selectAll()  { setSelected(new Set(horseGroups.map(g => g.horseId))) }
  function selectNone() { setSelected(new Set()) }

  function reset() {
    setDescription(defaultMonthLabel())
    setUnitPrice(unitPriceHint !== null ? unitPriceHint.toFixed(2) : '')
    setSelected(new Set(horseGroups.filter(g => g.chargesMonthlyBoard).map(g => g.horseId)))
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await addMonthlyBoardLineItems({
        horseIds:    Array.from(selected),
        description,
        unitPrice:   Number(unitPrice),
      })
      if (!res.ok) {
        setError(res.error)
      } else {
        setOpen(false)
        reset()
      }
    })
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540]"
        >
          + Add monthly board
        </button>
      </div>
    )
  }

  const rowCount = selected.size
  const total = (Number(unitPrice) || 0) * rowCount

  return (
    <div className="bg-white rounded border border-[#c4c6d1]/40 p-4 space-y-3">
      <div className="flex items-baseline gap-3">
        <h3 className="text-[#191c1e] font-semibold text-sm">Add monthly board</h3>
        <span className="text-xs text-[#8c8e98]">
          {rowCount === 0
            ? 'Pick one or more horses below'
            : `${rowCount} horse${rowCount === 1 ? '' : 's'} — one board line per horse`
          }
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { setOpen(false); reset() }}
          disabled={isPending}
          className="text-xs text-[#8c8e98] hover:text-[#444650] disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <label className="text-xs text-[#444650]">
          <span className="block mb-0.5 text-[#8c8e98]">Description (becomes the invoice line)</span>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
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

      <div className="space-y-1.5">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#8c8e98]">Apply to:</span>
          <button type="button" onClick={selectDefault} disabled={isPending} className="text-[#002058] hover:underline disabled:opacity-40">Boarders</button>
          <button type="button" onClick={selectAll}     disabled={isPending} className="text-[#002058] hover:underline disabled:opacity-40">All</button>
          <button type="button" onClick={selectNone}    disabled={isPending} className="text-[#002058] hover:underline disabled:opacity-40">None</button>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-1 px-2 py-2 bg-[#f7f9fc] rounded border border-[#e8ecf5]">
          {horseGroups.map(g => {
            const dup = alreadyHasBoard.has(g.horseId)
            return (
              <label key={g.horseId} className="flex items-center gap-1.5 text-xs text-[#444650] truncate" title={dup ? 'Already has an open Monthly Board line in the queue' : undefined}>
                <input
                  type="checkbox"
                  checked={selected.has(g.horseId)}
                  onChange={() => toggle(g.horseId)}
                />
                <span className={`truncate ${g.chargesMonthlyBoard ? '' : 'italic text-[#8c8e98]'}`}>{g.barnName}</span>
                {dup && <span className="text-[10px] text-[#a0701a]">●</span>}
              </label>
            )
          })}
        </div>
        {dupSelectedCount > 0 && (
          <div className="text-[11px] text-[#7a5408]">
            {dupSelectedCount} selected horse{dupSelectedCount === 1 ? '' : 's'} already ha{dupSelectedCount === 1 ? 's' : 've'} an open Monthly Board line. Submitting will add a second one.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs pt-1">
        <span className="text-[#8c8e98]">
          {rowCount > 0 && Number.isFinite(total) && (
            <>
              Per horse: <span className="font-mono text-[#191c1e]">${(Number(unitPrice) || 0).toFixed(2)}</span>
              {' · '}
              <span className="font-mono text-[#191c1e]">${total.toFixed(2)}</span> across {rowCount} horse{rowCount === 1 ? '' : 's'}
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
          {isPending ? 'Adding…' : `Add ${rowCount === 1 ? 'board line' : `${rowCount} board lines`}`}
        </button>
      </div>

      {error && <div className="text-xs text-[#8f3434]">{error}</div>}
    </div>
  )
}
