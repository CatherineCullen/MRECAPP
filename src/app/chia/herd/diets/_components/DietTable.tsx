'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveDietInline } from '../actions'

type DietFields = {
  am_feed:        string | null
  am_supplements: string | null
  am_hay:         string | null
  pm_feed:        string | null
  pm_supplements: string | null
  pm_hay:         string | null
  notes:          string | null
}

type FeedroomMed = {
  id:        string
  content:   string
  am:        string | null
  pm:        string | null
  starts_on: string | null
  ends_on:   string | null
}

type DietRow = {
  id:        string
  barn_name: string
  status:    string
  diet: (DietFields & { id: string }) | null
  meds: FeedroomMed[]
}

/** Compact "Apr 28 – May 5" / "until May 5" / "from Apr 28" date range. */
function fmtRange(starts: string | null, ends: string | null): string {
  function d(iso: string) {
    const [, m, day] = iso.split('-').map(Number)
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${day}`
  }
  if (starts && ends) return `${d(starts)}–${d(ends)}`
  if (ends)           return `until ${d(ends)}`
  if (starts)         return `from ${d(starts)}`
  return 'open-ended'
}

/** Combined-side cell render for AM Meds / PM Meds. Each med gets one
 *  line: the dose text + a small parenthetical date range. Multiple
 *  meds stack with a thin divider so the feed crew can scan top-down.
 *  If the row has no AM dose for a given med, that med's AM cell shows
 *  the content as a fallback so the crew can still see what the med
 *  is. Unbounded TCPs render "(open-ended)" so the crew knows it's not
 *  expiring soon. */
function MedCell({ side, meds }: { side: 'am' | 'pm'; meds: FeedroomMed[] }) {
  const present = meds.filter(m => (side === 'am' ? m.am : m.pm))
  if (present.length === 0) return null
  return (
    <div className="space-y-1">
      {present.map(m => (
        <div key={m.id}>
          <div>{side === 'am' ? m.am : m.pm}</div>
          <div className="text-[#8c8e98] text-[10px]">({fmtRange(m.starts_on, m.ends_on)})</div>
        </div>
      ))}
    </div>
  )
}

function cell(v: string | null | undefined) {
  return v ?? ''
}

/** Flatten the AM/PM med list to a single string per side for the CSV. */
function medText(meds: FeedroomMed[], side: 'am' | 'pm'): string {
  return meds
    .filter(m => (side === 'am' ? m.am : m.pm))
    .map(m => `${side === 'am' ? m.am : m.pm} (${fmtRange(m.starts_on, m.ends_on)})`)
    .join('\n')
}

function exportCSV(rows: DietRow[], selected: Set<string>) {
  const visible = rows.filter(r => selected.has(r.id))
  const headers = [
    'Horse',
    'AM Feed', 'AM Supplements', 'AM Hay', 'AM Meds',
    'PM Feed', 'PM Supplements', 'PM Hay', 'PM Meds',
    'Notes',
  ]
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [
    headers.map(escape).join(','),
    ...visible.map(r => [
      r.barn_name,
      cell(r.diet?.am_feed),
      cell(r.diet?.am_supplements),
      cell(r.diet?.am_hay),
      medText(r.meds, 'am'),
      cell(r.diet?.pm_feed),
      cell(r.diet?.pm_supplements),
      cell(r.diet?.pm_hay),
      medText(r.meds, 'pm'),
      cell(r.diet?.notes),
    ].map(escape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'feed-room.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const EMPTY: DietFields = {
  am_feed: '', am_supplements: '', am_hay: '',
  pm_feed: '', pm_supplements: '', pm_hay: '',
  notes: '',
}

export default function DietTable({ rows }: { rows: DietRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const allIds = rows.map(r => r.id)
  const [selected, setSelected] = useState<Set<string>>(new Set(allIds))

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<DietFields>(EMPTY)

  function toggleAll() {
    setSelected(selected.size === rows.length ? new Set() : new Set(allIds))
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function startEdit(r: DietRow) {
    setEditingId(r.id)
    setDraft({
      am_feed:        r.diet?.am_feed        ?? '',
      am_supplements: r.diet?.am_supplements ?? '',
      am_hay:         r.diet?.am_hay         ?? '',
      pm_feed:        r.diet?.pm_feed        ?? '',
      pm_supplements: r.diet?.pm_supplements ?? '',
      pm_hay:         r.diet?.pm_hay         ?? '',
      notes:          r.diet?.notes          ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY)
  }

  function save(r: DietRow) {
    startTransition(async () => {
      await saveDietInline(r.id, r.diet?.id ?? null, draft)
      setEditingId(null)
      setDraft(EMPTY)
      router.refresh()
    })
  }

  const visible = rows.filter(r => selected.has(r.id))

  const th      = 'px-2 py-1.5 text-left text-[10px] font-semibold text-[#444650] uppercase tracking-wider whitespace-nowrap'
  const td      = 'px-2 py-2 text-xs text-[#191c1e] align-top whitespace-pre-wrap'
  const tdEmpty = 'px-2 py-2 text-xs text-[#c4c6d1] align-top'
  const tdEdit  = 'px-1 py-1 align-top'
  const inputCls = 'w-full min-w-[100px] text-xs text-[#191c1e] bg-white border border-[#c4c6d1] rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#056380] resize-y'

  function field(key: keyof DietFields, rows = 2) {
    return (
      <textarea
        rows={rows}
        value={draft[key] ?? ''}
        onChange={e => setDraft({ ...draft, [key]: e.target.value })}
        className={inputCls}
      />
    )
  }

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
            onClick={() => {
              // Open the dedicated print route in a new tab. It honors the
              // current horse selection so you can print just the 8 horses
              // going to a show, etc. Falls back to all horses if no
              // selection is passed.
              const ids = [...selected].join(',')
              const url = ids ? `/print/feed-room?horses=${ids}` : '/print/feed-room'
              window.open(url, '_blank')
            }}
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

      {/* Note: this screen view is no longer the print target — the
          Print button opens a dedicated /print/feed-room route in a
          new tab and triggers window.print() there, so the printed
          page is custom-built for paper without inheriting any of
          the CHIA chrome. */}

      {visible.length === 0 ? (
        <p className="text-sm text-[#444650]">No horses selected.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left bg-white print:text-[10px]">
            <thead>
              <tr className="bg-[#f2f4f7]">
                {/* The "border-l-[4px] border-l-[#002058]" on the PM
                    columns gives the day-half boundary a strong, easy-
                    to-find visual rule for the feed crew scanning the
                    sheet. Same on each PM body cell below. */}
                <th className={`${th} border border-[#e0e3e6]`} rowSpan={2}>Horse</th>
                <th className={`${th} border border-[#e0e3e6] text-center`} colSpan={4}>AM</th>
                <th className={`${th} border border-[#e0e3e6] text-center border-l-[4px] border-l-[#002058]`} colSpan={4}>PM</th>
                <th className={`${th} border border-[#e0e3e6]`} rowSpan={2}>Notes</th>
                <th className={`${th} border border-[#e0e3e6] print:hidden`} rowSpan={2}></th>
              </tr>
              <tr className="bg-[#f2f4f7]">
                <th className={`${th} border border-[#e0e3e6]`}>Feed</th>
                <th className={`${th} border border-[#e0e3e6]`}>Supplements</th>
                <th className={`${th} border border-[#e0e3e6]`}>Hay</th>
                <th className={`${th} border border-[#e0e3e6] bg-[#dae2ff]/40`}>Meds</th>
                <th className={`${th} border border-[#e0e3e6] border-l-[4px] border-l-[#002058]`}>Feed</th>
                <th className={`${th} border border-[#e0e3e6]`}>Supplements</th>
                <th className={`${th} border border-[#e0e3e6]`}>Hay</th>
                <th className={`${th} border border-[#e0e3e6] bg-[#dae2ff]/40`}>Meds</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const isEditing = editingId === r.id
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]'

                // The Meds columns are sourced from active feedroom-flagged
                // care_plan rows (not editable here — admin manages those
                // from the horse profile / Care Plans tab).
                const amMeds = <MedCell side="am" meds={r.meds} />
                const pmMeds = <MedCell side="pm" meds={r.meds} />
                const hasAmMeds = r.meds.some(m => m.am)
                const hasPmMeds = r.meds.some(m => m.pm)

                if (isEditing) {
                  // Meds cells are read-only here — they're sourced from
                  // active feedroom-flagged care plans, which are managed
                  // on the horse page. Show a small inline hint linking
                  // straight to the add-care-plan form so an admin in edit
                  // mode can jump there in one click.
                  const medsHint = (
                    <div className="mt-1 text-[9px] italic">
                      <Link
                        href={`/chia/herd/horses/${r.id}/care-plans/new`}
                        className="text-[#056380] hover:text-[#002058] hover:underline"
                      >
                        + Add med (on horse page)
                      </Link>
                    </div>
                  )
                  return (
                    <tr key={r.id} className={rowBg}>
                      <td className={`${td} font-semibold border border-[#e0e3e6]`}>
                        <Link
                          href={`/chia/herd/horses/${r.id}`}
                          className="text-[#056380] hover:text-[#002058] hover:underline"
                        >
                          {r.barn_name}
                        </Link>
                      </td>
                      <td className={`${tdEdit} border border-[#e0e3e6]`}>{field('am_feed')}</td>
                      <td className={`${tdEdit} border border-[#e0e3e6]`}>{field('am_supplements')}</td>
                      <td className={`${tdEdit} border border-[#e0e3e6]`}>{field('am_hay')}</td>
                      <td className={`${hasAmMeds ? td : tdEmpty} border border-[#e0e3e6] bg-[#dae2ff]/30`}>
                        {amMeds ?? '—'}
                        {medsHint}
                      </td>
                      <td className={`${tdEdit} border border-[#e0e3e6] border-l-[4px] border-l-[#002058]`}>{field('pm_feed')}</td>
                      <td className={`${tdEdit} border border-[#e0e3e6]`}>{field('pm_supplements')}</td>
                      <td className={`${tdEdit} border border-[#e0e3e6]`}>{field('pm_hay')}</td>
                      <td className={`${hasPmMeds ? td : tdEmpty} border border-[#e0e3e6] bg-[#dae2ff]/30`}>
                        {pmMeds ?? '—'}
                        {medsHint}
                      </td>
                      <td className={`${tdEdit} border border-[#e0e3e6]`}>{field('notes', 3)}</td>
                      <td className={`${tdEdit} border border-[#e0e3e6] print:hidden whitespace-nowrap`}>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => save(r)}
                            disabled={pending}
                            className="text-[10px] font-semibold text-white bg-[#056380] hover:bg-[#002058] px-2 py-1 rounded disabled:opacity-60"
                          >
                            {pending ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={pending}
                            className="text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] px-2 py-1 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={r.id} className={rowBg}>
                    <td className={`${td} font-semibold border border-[#e0e3e6]`}>
                      <Link
                        href={`/chia/herd/horses/${r.id}`}
                        className="text-[#056380] hover:text-[#002058] hover:underline"
                      >
                        {r.barn_name}
                      </Link>
                    </td>
                    {r.diet ? (
                      <>
                        <td className={`${r.diet.am_feed        ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.am_feed        ?? '—'}</td>
                        <td className={`${r.diet.am_supplements ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.am_supplements ?? '—'}</td>
                        <td className={`${r.diet.am_hay         ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.am_hay         ?? '—'}</td>
                        <td className={`${hasAmMeds ? td : tdEmpty} border border-[#e0e3e6] bg-[#dae2ff]/30`}>{amMeds ?? '—'}</td>
                        <td className={`${r.diet.pm_feed        ? td : tdEmpty} border border-[#e0e3e6] border-l-[4px] border-l-[#002058]`}>{r.diet.pm_feed        ?? '—'}</td>
                        <td className={`${r.diet.pm_supplements ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.pm_supplements ?? '—'}</td>
                        <td className={`${r.diet.pm_hay         ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.pm_hay         ?? '—'}</td>
                        <td className={`${hasPmMeds ? td : tdEmpty} border border-[#e0e3e6] bg-[#dae2ff]/30`}>{pmMeds ?? '—'}</td>
                        <td className={`${r.diet.notes          ? td : tdEmpty} border border-[#e0e3e6]`}>{r.diet.notes          ?? '—'}</td>
                      </>
                    ) : (
                      <>
                        <td colSpan={3} className={`${tdEmpty} border border-[#e0e3e6] italic`}>No diet on file</td>
                        <td className={`${hasAmMeds ? td : tdEmpty} border border-[#e0e3e6] bg-[#dae2ff]/30`}>{amMeds ?? '—'}</td>
                        <td colSpan={3} className={`${tdEmpty} border border-[#e0e3e6] border-l-[4px] border-l-[#002058]`}>—</td>
                        <td className={`${hasPmMeds ? td : tdEmpty} border border-[#e0e3e6] bg-[#dae2ff]/30`}>{pmMeds ?? '—'}</td>
                        <td className={`${tdEmpty} border border-[#e0e3e6]`}>—</td>
                      </>
                    )}
                    <td className={`${tdEdit} border border-[#e0e3e6] print:hidden whitespace-nowrap`}>
                      <button
                        onClick={() => startEdit(r)}
                        className="text-[10px] font-semibold text-[#056380] hover:text-[#002058] px-2 py-1 rounded"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
