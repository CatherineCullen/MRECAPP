'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertHealthItemType, setHealthItemTypeActive, moveHealthItemType } from '../actions'

export type HealthItemTypeRow = {
  id:                     string
  name:                   string
  is_essential:           boolean
  show_in_herd_dashboard: boolean
  default_interval_days:  number | null
  sort_order:             number
  is_active:              boolean
}

/**
 * A single row in the catalog panel. Inline-edit pattern: click Edit to open
 * the row into an editable form, Save / Cancel to close. Deactivation is a
 * one-click action since it's soft-delete and reversible.
 *
 * The reorder arrows only appear for active rows — deactivated items aren't
 * in the dashboard ordering anyway.
 */
export default function CatalogRow({ row }: { row: HealthItemTypeRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [name, setName]       = useState(row.name)
  const [essential, setEssential] = useState(row.is_essential)
  const [inGrid, setInGrid]   = useState(row.show_in_herd_dashboard)
  const [days, setDays]       = useState<string>(row.default_interval_days?.toString() ?? '')

  function save() {
    setError(null)
    if (!name.trim()) { setError('Name required'); return }
    const interval = days.trim() === '' ? null : Number(days)
    if (interval !== null && (!Number.isFinite(interval) || interval <= 0)) {
      setError('Interval must be a positive number of days, or blank')
      return
    }
    startTransition(async () => {
      const r = await upsertHealthItemType({
        id:                     row.id,
        name:                   name.trim(),
        is_essential:           essential,
        show_in_herd_dashboard: inGrid,
        default_interval_days:  interval,
        sort_order:             row.sort_order,
      })
      if (r.error) setError(r.error)
      else { setEditing(false); router.refresh() }
    })
  }

  function toggleActive() {
    setError(null)
    startTransition(async () => {
      const r = await setHealthItemTypeActive(row.id, !row.is_active)
      if (r.error) setError(r.error)
      else         router.refresh()
    })
  }

  function move(direction: 'up' | 'down') {
    setError(null)
    startTransition(async () => {
      const r = await moveHealthItemType(row.id, direction)
      if (r.error) setError(r.error)
      else         router.refresh()
    })
  }

  if (editing) {
    return (
      <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
        <td className="py-1.5 px-3" />
        <td className="py-1.5 px-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
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
          <button onClick={save}               disabled={pending} className="bg-[#002058] text-white text-xs font-semibold px-2 py-1 rounded hover:bg-[#003099] disabled:opacity-50">Save</button>
          <button onClick={() => setEditing(false)} disabled={pending} className="ml-1 text-xs text-[#444650] px-2 py-1 rounded border border-[#c4c6d1]">Cancel</button>
          {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
        </td>
      </tr>
    )
  }

  const greyed = !row.is_active
  return (
    <tr className={`border-b border-[#c4c6d1]/30 ${greyed ? 'opacity-50' : ''}`}>
      <td className="py-1.5 px-3 w-16 whitespace-nowrap">
        {row.is_active && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => move('up')}
              disabled={pending}
              title="Move up"
              className="text-[#444650] hover:text-[#191c1e] text-xs leading-none px-1"
            >▲</button>
            <button
              onClick={() => move('down')}
              disabled={pending}
              title="Move down"
              className="text-[#444650] hover:text-[#191c1e] text-xs leading-none px-1"
            >▼</button>
          </div>
        )}
      </td>
      <td className="py-1.5 px-3 text-xs text-[#191c1e] font-semibold">{row.name}</td>
      <td className="py-1.5 px-3 text-center text-xs">{row.show_in_herd_dashboard ? '✓' : ''}</td>
      <td className="py-1.5 px-3 text-center text-xs">{row.is_essential ? '✓' : ''}</td>
      <td className="py-1.5 px-3 text-xs text-[#444650]">{row.default_interval_days ? `${row.default_interval_days} days` : '—'}</td>
      <td className="py-1.5 px-3 text-right whitespace-nowrap">
        <button
          onClick={() => setEditing(true)}
          disabled={pending}
          className="text-xs text-[#444650] px-2 py-1 rounded border border-[#c4c6d1] hover:bg-[#f7f9fc] disabled:opacity-50"
        >
          Edit
        </button>
        <button
          onClick={toggleActive}
          disabled={pending}
          className={`ml-1 text-xs font-semibold px-2 py-1 rounded transition-colors disabled:opacity-50 ${
            row.is_active
              ? 'text-[#8a1a1a] hover:bg-[#ffd6d6]/30'
              : 'text-[#1a6b3c] hover:bg-[#b7f0d0]/40'
          }`}
        >
          {row.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
      </td>
    </tr>
  )
}
