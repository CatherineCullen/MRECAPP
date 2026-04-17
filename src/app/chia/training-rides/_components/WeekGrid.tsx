'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { scheduleRide, unscheduleRide, logRide, unlogRide } from '../actions'

export type GridHorse = {
  id:        string
  name:      string
  rides_60d: number
}

// One record per cell (provider × horse × day). Missing entries are empty cells.
export type GridCell = {
  id:     string                    // training_ride.id
  status: 'scheduled' | 'logged'
  notes:  string | null
}

type Props = {
  providerId:   string
  horses:       GridHorse[]
  weekDays:     string[]             // 7 ISO dates, Monday-first
  cellsByKey:   Record<string, GridCell>  // key = `${horseId}:${date}`
  availableHorses: GridHorse[]        // horses NOT in the active grid (for "Add horse")
}

function shortDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return {
    dow: date.toLocaleDateString('en-US', { weekday: 'short' }),
    num: date.getDate(),
  }
}

function isToday(iso: string) {
  const t = new Date()
  const todayIso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  return iso === todayIso
}

export default function WeekGrid({ providerId, horses, weekDays, cellsByKey, availableHorses }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError]          = useState<string | null>(null)
  const [addingHorse, setAddingHorse] = useState(false)
  const [newHorseId, setNewHorseId]   = useState('')
  const [newHorseDate, setNewHorseDate] = useState(weekDays[0])

  function handleCellClick(horseId: string, date: string) {
    setError(null)
    const key = `${horseId}:${date}`
    const existing = cellsByKey[key]

    startTransition(async () => {
      if (!existing) {
        const r = await scheduleRide({ riderId: providerId, horseId, date })
        if (r?.error) setError(r.error)
        else router.refresh()
      } else if (existing.status === 'scheduled') {
        const r = await unscheduleRide(existing.id)
        if (r?.error) setError(r.error)
        else router.refresh()
      }
      // Logged cells: click does nothing here — use the "Log" row action
    })
  }

  function handleLogClick(cell: GridCell) {
    setError(null)
    startTransition(async () => {
      const r = cell.status === 'scheduled'
        ? await logRide(cell.id, null)
        : await unlogRide(cell.id)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  function handleAddHorse() {
    setError(null)
    if (!newHorseId) { setError('Select a horse.'); return }
    startTransition(async () => {
      const r = await scheduleRide({ riderId: providerId, horseId: newHorseId, date: newHorseDate })
      if (r?.error) setError(r.error)
      else {
        setAddingHorse(false)
        setNewHorseId('')
        router.refresh()
      }
    })
  }

  return (
    <div>
      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f7f9fc] border-b border-[#c4c6d1]/30">
              <th className="py-2 px-3 text-left font-semibold text-[#444650] sticky left-0 bg-[#f7f9fc] min-w-[160px]">
                Horse
              </th>
              {weekDays.map(iso => {
                const { dow, num } = shortDay(iso)
                const today = isToday(iso)
                return (
                  <th
                    key={iso}
                    className={`py-2 px-2 font-semibold text-center min-w-[90px] ${today ? 'bg-[#002058] text-white' : 'text-[#444650]'}`}
                  >
                    <div className="text-[10px] uppercase tracking-wide opacity-80">{dow}</div>
                    <div className="text-sm font-bold">{num}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {horses.length === 0 ? (
              <tr>
                <td colSpan={weekDays.length + 1} className="py-6 text-center text-xs text-[#444650]">
                  No training-active horses for this provider. Use "+ Add horse" below to schedule one.
                </td>
              </tr>
            ) : (
              horses.map(h => {
                // Any logged cell for this row?
                const rowCells = weekDays.map(d => cellsByKey[`${h.id}:${d}`])
                return (
                  <tr key={h.id} className="border-b border-[#c4c6d1]/20 hover:bg-[#f7f9fc]/40">
                    <td className="py-2 px-3 sticky left-0 bg-white border-r border-[#c4c6d1]/20">
                      <div className="font-semibold text-[#191c1e]">{h.name}</div>
                      <div className="text-[10px] text-[#444650]">{h.rides_60d} rides / 60d</div>
                    </td>
                    {weekDays.map((d, idx) => {
                      const cell: GridCell | undefined = rowCells[idx]
                      const baseCls = 'w-full h-10 flex items-center justify-center text-xs transition-colors relative group'

                      let cellCls = baseCls
                      let content: React.ReactNode
                      let title: string
                      if (!cell) {
                        cellCls += ' hover:bg-[#dae2ff]/30 cursor-pointer'
                        content  = <span className="text-[#c4c6d1] group-hover:text-[#002058] text-base">+</span>
                        title    = 'Click to schedule'
                      } else if (cell.status === 'scheduled') {
                        cellCls += ' bg-[#dae2ff]/40 hover:bg-[#ffd6d6]/40'
                        content  = (
                          <>
                            <span className="text-[#002058] font-bold group-hover:hidden">✓</span>
                            <span className="text-[#8a1a1a] font-bold hidden group-hover:inline">×</span>
                          </>
                        )
                        title    = 'Scheduled — click to remove'
                      } else {
                        cellCls += ' bg-[#b7f0d0]/50'
                        content  = <span className="text-[#1a6b3c] font-bold">✓✓</span>
                        title    = 'Logged (billable) — use the Log list below to unlog'
                      }

                      return (
                        <td key={d} className="p-0 border-l border-[#c4c6d1]/10">
                          <button
                            onClick={() => handleCellClick(h.id, d)}
                            disabled={pending || cell?.status === 'logged'}
                            className={cellCls}
                            title={title}
                          >
                            {content}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Legend + Add horse */}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[10px] text-[#444650]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#dae2ff]/60 border border-[#c4c6d1] inline-flex items-center justify-center text-[8px] text-[#002058] font-bold">✓</span>
            Scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#b7f0d0]/60 border border-[#c4c6d1] inline-flex items-center justify-center text-[8px] text-[#1a6b3c] font-bold">✓✓</span>
            Logged (billable)
          </span>
          <span className="text-[#444650]">Click a ✓ to unschedule · ✓✓ is locked</span>
        </div>

        {!addingHorse ? (
          <button
            onClick={() => setAddingHorse(true)}
            className="text-xs text-[#002058] font-semibold border border-[#c4c6d1] px-2.5 py-1 rounded hover:border-[#002058] hover:bg-[#f7f9fc] transition-colors"
          >
            + Add horse
          </button>
        ) : (
          <div className="flex items-center gap-1.5 bg-white border border-[#c4c6d1] rounded px-2 py-1">
            <select
              value={newHorseId}
              onChange={e => setNewHorseId(e.target.value)}
              className="text-xs border border-[#c4c6d1] rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-[#002058]"
            >
              <option value="">— Horse —</option>
              {availableHorses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <select
              value={newHorseDate}
              onChange={e => setNewHorseDate(e.target.value)}
              className="text-xs border border-[#c4c6d1] rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-[#002058]"
            >
              {weekDays.map(d => {
                const { dow, num } = shortDay(d)
                return <option key={d} value={d}>{dow} {num}</option>
              })}
            </select>
            <button
              onClick={handleAddHorse}
              disabled={pending}
              className="text-[10px] font-semibold text-[#002058] hover:underline disabled:opacity-50"
            >
              Schedule
            </button>
            <button
              onClick={() => { setAddingHorse(false); setNewHorseId('') }}
              className="text-[10px] text-[#444650] hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Log/Unlog row actions — listed separately so the grid stays clean */}
      {horses.length > 0 && (
        <details className="mt-4 bg-white rounded-lg border border-[#c4c6d1]/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-[#191c1e] hover:bg-[#f7f9fc]">
            Log / Unlog rides this week
          </summary>
          <div className="border-t border-[#c4c6d1]/30 p-2">
            {weekDays.flatMap(d =>
              horses
                .map(h => cellsByKey[`${h.id}:${d}`])
                .filter(Boolean)
                .map(cell => ({ cell: cell!, date: d }))
            ).length === 0 ? (
              <div className="text-xs text-[#444650] py-2 text-center">No scheduled or logged rides this week.</div>
            ) : (
              <ul className="space-y-1">
                {weekDays.flatMap(d =>
                  horses.flatMap(h => {
                    const cell = cellsByKey[`${h.id}:${d}`]
                    if (!cell) return []
                    const { dow, num } = shortDay(d)
                    return [(
                      <li key={cell.id} className="flex items-center justify-between px-2 py-1 text-xs hover:bg-[#f7f9fc] rounded">
                        <span>
                          <span className="font-semibold text-[#191c1e]">{h.name}</span>
                          <span className="text-[#444650]"> · {dow} {num}</span>
                          <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            cell.status === 'logged' ? 'bg-[#b7f0d0] text-[#1a6b3c]' : 'bg-[#dae2ff] text-[#002058]'
                          }`}>
                            {cell.status}
                          </span>
                        </span>
                        <button
                          onClick={() => handleLogClick(cell)}
                          disabled={pending}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors disabled:opacity-50 ${
                            cell.status === 'scheduled'
                              ? 'text-[#1a6b3c] border-[#b7f0d0] hover:bg-[#b7f0d0]/30'
                              : 'text-[#444650] border-[#c4c6d1] hover:bg-[#e8eaf0]'
                          }`}
                        >
                          {cell.status === 'scheduled' ? 'Log' : 'Unlog'}
                        </button>
                      </li>
                    )]
                  })
                )}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
