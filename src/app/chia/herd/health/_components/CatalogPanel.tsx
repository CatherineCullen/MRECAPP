'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertHealthItemType } from '../actions'
import CatalogRow, { type HealthItemTypeRow } from './CatalogRow'

/**
 * Collapsible panel above the herd health grid for managing the item-type
 * catalog. Defaults closed so the grid is still the first thing the admin
 * sees on page load.
 *
 * The "In Grid" column toggles show_in_herd_dashboard — i.e. which types
 * appear as columns on the grid below. Unchecking hides the column without
 * losing any history (it's still a tracked item, just not in the grid).
 *
 * "Essential" marks a type that every active horse is expected to have;
 * missing entries appear grayed on the grid. It's a visibility signal, not
 * a compliance rule.
 */
export default function CatalogPanel({ rows }: { rows: HealthItemTypeRow[] }) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [adding, setAdding]       = useState(false)
  const [pending, startTransition] = useTransition()

  // New-item form state
  const [name, setName]           = useState('')
  const [essential, setEssential] = useState(false)
  const [inGrid, setInGrid]       = useState(true)   // default on — most new items want to appear
  const [days, setDays]           = useState('')
  const [error, setError]         = useState<string | null>(null)

  const active = useMemo(() => rows.filter(r => r.is_active), [rows])
  const inactive = useMemo(() => rows.filter(r => !r.is_active), [rows])
  const visible = showInactive ? [...active, ...inactive] : active

  // Next sort_order appended to the end of the active list.
  const nextSortOrder = useMemo(() => {
    if (active.length === 0) return 10
    return Math.max(...active.map(r => r.sort_order)) + 10
  }, [active])

  function submitNew() {
    setError(null)
    if (!name.trim()) { setError('Name required'); return }
    const interval = days.trim() === '' ? null : Number(days)
    if (interval !== null && (!Number.isFinite(interval) || interval <= 0)) {
      setError('Interval must be a positive number of days, or blank')
      return
    }
    startTransition(async () => {
      const r = await upsertHealthItemType({
        name:                   name.trim(),
        is_essential:           essential,
        show_in_herd_dashboard: inGrid,
        default_interval_days:  interval,
        sort_order:             nextSortOrder,
      })
      if (r.error) { setError(r.error); return }
      setName(''); setEssential(false); setInGrid(true); setDays('')
      setAdding(false)
      router.refresh()
    })
  }

  return (
    <section className="bg-white rounded-lg border border-[#c4c6d1]/40 mb-4 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#f2f4f7] hover:bg-[#e8eaf0] transition-colors"
      >
        <span className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Manage health items
          <span className="ml-1.5 text-[10px] font-normal normal-case tracking-normal">
            ({active.length} active{inactive.length > 0 ? `, ${inactive.length} inactive` : ''})
          </span>
        </span>
        <span className="text-[10px] text-[#444650]">{open ? 'Close' : 'Open'}</span>
      </button>

      {open && (
        <div className="border-t border-[#c4c6d1]/30">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
                <th className="py-1.5 px-3 w-16" />
                <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Name</th>
                <th className="py-1.5 px-3 text-center text-[10px] font-semibold text-[#444650] uppercase w-20">In Grid</th>
                <th className="py-1.5 px-3 text-center text-[10px] font-semibold text-[#444650] uppercase w-20">Essential</th>
                <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-32">Default Interval</th>
                <th className="py-1.5 px-3 text-right text-[10px] font-semibold text-[#444650] uppercase w-56">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !adding && (
                <tr>
                  <td colSpan={6} className="py-4 px-3 text-center text-xs text-[#444650] italic">
                    No health items yet. Add one below.
                  </td>
                </tr>
              )}
              {visible.map(r => <CatalogRow key={r.id} row={r} />)}

              {adding && (
                <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
                  <td className="py-1.5 px-3" />
                  <td className="py-1.5 px-3">
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Flu/Rhino"
                      className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1 bg-white"
                      autoFocus
                    />
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <input type="checkbox" checked={inGrid}    onChange={e => setInGrid(e.target.checked)}    className="accent-[#002058]" />
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <input type="checkbox" checked={essential} onChange={e => setEssential(e.target.checked)} className="accent-[#002058]" />
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="number"
                      min={1}
                      value={days}
                      onChange={e => setDays(e.target.value)}
                      placeholder="e.g. 365"
                      className="w-24 text-xs border border-[#c4c6d1] rounded px-2 py-1 bg-white"
                    />
                  </td>
                  <td className="py-1.5 px-3 text-right whitespace-nowrap">
                    <button onClick={submitNew}              disabled={pending} className="bg-[#002058] text-white text-xs font-semibold px-2 py-1 rounded hover:bg-[#003099] disabled:opacity-50">Add</button>
                    <button onClick={() => { setAdding(false); setError(null) }} disabled={pending} className="ml-1 text-xs text-[#444650] px-2 py-1 rounded border border-[#c4c6d1]">Cancel</button>
                    {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-2 bg-[#f7f9fc] border-t border-[#c4c6d1]/30">
            <div className="flex items-center gap-3">
              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="text-xs font-semibold text-[#002058] border border-[#c4c6d1] bg-white px-3 py-1 rounded hover:bg-white"
                >
                  + Add health item
                </button>
              )}
              {inactive.length > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-[#444650] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={e => setShowInactive(e.target.checked)}
                    className="accent-[#002058]"
                  />
                  Show deactivated ({inactive.length})
                </label>
              )}
            </div>
            <p className="text-[10px] text-[#444650] italic">
              Changes here also update the AI vet-import prompt automatically.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
