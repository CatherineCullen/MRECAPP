'use client'

import { useState } from 'react'

type DietRow = {
  id:        string
  barn_name: string
  status:    string
  diet: {
    am_feed:        string | null
    am_supplements: string | null
    am_hay:         string | null
    pm_feed:        string | null
    pm_supplements: string | null
    pm_hay:         string | null
    notes:          string | null
  } | null
}

function cell(v: string | null | undefined) {
  return v ?? ''
}

function exportCSV(rows: DietRow[], selected: Set<string>) {
  const visible = rows.filter(r => selected.has(r.id))
  const headers = ['Horse', 'AM Feed', 'AM Supplements/Meds', 'AM Hay', 'PM Feed', 'PM Supplements/Meds', 'PM Hay', 'Notes']
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [
    headers.map(escape).join(','),
    ...visible.map(r => [
      r.barn_name,
      cell(r.diet?.am_feed),
      cell(r.diet?.am_supplements),
      cell(r.diet?.am_hay),
      cell(r.diet?.pm_feed),
      cell(r.diet?.pm_supplements),
      cell(r.diet?.pm_hay),
      cell(r.diet?.notes),
    ].map(escape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'diets.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function DietTable({ rows }: { rows: DietRow[] }) {
  const allIds = rows.map(r => r.id)
  const [selected, setSelected] = useState<Set<string>>(new Set(allIds))

  function toggleAll() {
    setSelected(selected.size === rows.length ? new Set() : new Set(allIds))
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const visible = rows.filter(r => selected.has(r.id))

  const th = 'px-2 py-1.5 text-left text-[10px] font-semibold text-[#444650] uppercase tracking-wider whitespace-nowrap'
  const td = 'px-2 py-2 text-xs text-[#191c1e] align-top whitespace-pre-wrap'
  const tdEmpty = 'px-2 py-2 text-xs text-[#c4c6d1] align-top'

  return (
    <>
      {/* Toolbar — hidden on print */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-[#191c1e]">
            Diets &amp; Supplements
          </h1>
          <span className="text-xs text-[#444650]">
            {selected.size} of {rows.length} horses
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(rows, selected)}
            className="text-xs font-semibold text-[#444650] hover:text-[#191c1e] border border-[#c4c6d1]/60 px-3 py-1.5 rounded"
          >
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs font-semibold text-white bg-[#056380] hover:bg-[#002058] px-3 py-1.5 rounded"
          >
            Print
          </button>
        </div>
      </div>

      {/* Horse selector — hidden on print */}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={toggleAll}
          className="text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
        >
          {selected.size === rows.length ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-[#c4c6d1] text-xs">·</span>
        {rows.map(r => (
          <label key={r.id} className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggleOne(r.id)}
              className="accent-[#056380]"
            />
            <span className={`text-xs ${selected.has(r.id) ? 'text-[#191c1e] font-semibold' : 'text-[#444650]'}`}>
              {r.barn_name}
            </span>
          </label>
        ))}
      </div>

      {/* Print header — visible on print only */}
      <div className="hidden print:block mb-4">
        <p className="text-xs text-[#444650]">Marlboro Ridge Equestrian Center — Feed Sheet</p>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-[#444650]">No horses selected.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left bg-white print:text-[10px]">
            <thead>
              <tr className="bg-[#f2f4f7]">
                <th className={`${th} border border-[#e0e3e6]`} rowSpan={2}>Horse</th>
                <th className={`${th} border border-[#e0e3e6] text-center`} colSpan={3}>AM</th>
                <th className={`${th} border border-[#e0e3e6] text-center`} colSpan={3}>PM</th>
                <th className={`${th} border border-[#e0e3e6]`} rowSpan={2}>Notes</th>
              </tr>
              <tr className="bg-[#f2f4f7]">
                <th className={`${th} border border-[#e0e3e6]`}>Feed</th>
                <th className={`${th} border border-[#e0e3e6]`}>Supps / Meds</th>
                <th className={`${th} border border-[#e0e3e6]`}>Hay</th>
                <th className={`${th} border border-[#e0e3e6]`}>Feed</th>
                <th className={`${th} border border-[#e0e3e6]`}>Supps / Meds</th>
                <th className={`${th} border border-[#e0e3e6]`}>Hay</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]'}>
                  <td className={`${td} font-semibold border border-[#e0e3e6]`}>{r.barn_name}</td>
                  {r.diet ? (
                    <>
                      <td className={`${r.diet.am_feed        ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.am_feed        ?? '—'}</td>
                      <td className={`${r.diet.am_supplements ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.am_supplements ?? '—'}</td>
                      <td className={`${r.diet.am_hay         ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.am_hay         ?? '—'}</td>
                      <td className={`${r.diet.pm_feed        ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.pm_feed        ?? '—'}</td>
                      <td className={`${r.diet.pm_supplements ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.pm_supplements ?? '—'}</td>
                      <td className={`${r.diet.pm_hay         ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.pm_hay         ?? '—'}</td>
                      <td className={`${r.diet.notes          ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.notes          ?? '—'}</td>
                    </>
                  ) : (
                    <td colSpan={7} className={`${tdEmpty} border border-[#e0e3e6] italic`}>No diet on file</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
