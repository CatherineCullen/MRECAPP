'use client'

import { useMemo, useState, useTransition } from 'react'
import { logBoardServices } from '@/lib/boardServiceLogging'

export type HorseLite = { horseId: string; name: string; recentCount?: number }

type Props = {
  heading:          string             // e.g. "Wrapping" or "Greg Smith"
  subheading?:      string             // e.g. "Billable" or "Farrier"
  serviceId:        string
  loggedByLabel:    string
  providerQrCodeId?: string
  logSource:        'qr_code' | 'app' | 'admin'
  recentHorses:     HorseLite[]        // already sorted by frequency desc
  allHorses:        HorseLite[]        // full list for "Add a horse"
  confirmationCopy?: string            // default: "Thanks — logged for N horses."
}

/**
 * The shared horse-picker form used by all scan / log-entry surfaces. Kept
 * mobile-first: large tap targets, single column, no hover states. The form
 * scales well on desktop when admins use it from CHIA back-fill.
 */
export default function BoardServiceScanForm({
  heading, subheading, serviceId, loggedByLabel, providerQrCodeId, logSource,
  recentHorses, allHorses, confirmationCopy,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [done, setDone]             = useState<number | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [date, setDate]             = useState(todayLocalInput())
  const [showAll, setShowAll]       = useState(false)
  const [selected, setSelected]     = useState<Map<string, string>>(new Map())  // horseId → notes

  // Horses not already in the recent list. When the admin taps "Add a horse"
  // we reveal these in a second block so they can check the ones needed.
  const otherHorses = useMemo(() => {
    const recentIds = new Set(recentHorses.map(h => h.horseId))
    return allHorses.filter(h => !recentIds.has(h.horseId))
  }, [recentHorses, allHorses])

  function toggle(horseId: string) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(horseId)) next.delete(horseId)
      else                   next.set(horseId, '')
      return next
    })
  }

  function setNote(horseId: string, note: string) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(horseId)) next.set(horseId, note)
      return next
    })
  }

  function submit() {
    setError(null)
    if (selected.size === 0) { setError('Pick at least one horse'); return }
    // Convert the local datetime-input value back to an ISO string.
    // `new Date(<local-input>)` interprets it as local time, which is what we want.
    const loggedAtIso = new Date(date).toISOString()
    startTransition(async () => {
      const r = await logBoardServices({
        serviceId,
        horses:         Array.from(selected.entries()).map(([horseId, notes]) => ({ horseId, notes })),
        loggedAt:       loggedAtIso,
        loggedByLabel,
        logSource,
        providerQrCodeId,
      })
      if (r.error) { setError(r.error); return }
      setDone(r.count ?? selected.size)
    })
  }

  if (done != null) {
    return (
      <div className="min-h-screen bg-[#f7f9fc] flex items-center justify-center p-6">
        <div className="bg-white rounded-lg p-8 max-w-md w-full text-center border border-[#c4c6d1]/40">
          <div className="text-4xl mb-3">✓</div>
          <h1 className="text-lg font-bold text-[#191c1e] mb-1">Thanks!</h1>
          <p className="text-sm text-[#444650]">
            {confirmationCopy ?? `Logged ${heading} for ${done} horse${done === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] pb-24">
      <div className="bg-white border-b border-[#c4c6d1]/40 px-5 py-4">
        <h1 className="text-xl font-bold text-[#191c1e] leading-tight">{heading}</h1>
        {subheading && <div className="text-sm text-[#444650] mt-0.5">{subheading}</div>}
      </div>

      <div className="p-5 max-w-lg mx-auto">
        {/* Date */}
        <label className="block mb-4">
          <span className="text-xs font-semibold text-[#444650] block mb-1">When</span>
          <input
            type="datetime-local"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full text-sm border border-[#c4c6d1] rounded px-3 py-2 focus:outline-none focus:border-[#002058] bg-white"
          />
        </label>

        {/* Recent horses */}
        <section className="mb-4">
          <div className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">
            {recentHorses.length > 0 ? 'Recent (last 60 days)' : 'Horses'}
          </div>
          {recentHorses.length === 0 && !showAll && (
            <div className="text-sm text-[#444650] italic px-1 py-2">
              No recent horses yet. Tap below to pick one.
            </div>
          )}
          <ul className="space-y-1">
            {recentHorses.map(h => (
              <HorseRow
                key={h.horseId}
                horse={h}
                checked={selected.has(h.horseId)}
                notes={selected.get(h.horseId) ?? ''}
                onToggle={() => toggle(h.horseId)}
                onNotes={note => setNote(h.horseId, note)}
              />
            ))}
          </ul>
        </section>

        {/* Add a horse */}
        {!showAll && otherHorses.length > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-sm font-semibold text-[#002058] border border-[#c4c6d1] bg-white rounded py-2 hover:bg-[#f7f9fc]"
          >
            + Add a horse
          </button>
        )}

        {showAll && (
          <section className="mb-4">
            <div className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2 mt-2">
              All horses
            </div>
            <ul className="space-y-1">
              {otherHorses.map(h => (
                <HorseRow
                  key={h.horseId}
                  horse={h}
                  checked={selected.has(h.horseId)}
                  notes={selected.get(h.horseId) ?? ''}
                  onToggle={() => toggle(h.horseId)}
                  onNotes={note => setNote(h.horseId, note)}
                />
              ))}
            </ul>
          </section>
        )}

        {error && (
          <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-[#c4c6d1]/40 px-5 py-3">
        <button
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="w-full bg-[#002058] text-white text-sm font-semibold px-4 py-3 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Logging…' : selected.size === 0 ? 'Pick at least one horse' : `Log for ${selected.size} horse${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

function HorseRow({ horse, checked, notes, onToggle, onNotes }: {
  horse:    HorseLite
  checked:  boolean
  notes:    string
  onToggle: () => void
  onNotes:  (s: string) => void
}) {
  return (
    <li className="bg-white rounded border border-[#c4c6d1]/40 overflow-hidden">
      <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-[#002058] w-4 h-4"
        />
        <span className="flex-1 text-sm font-semibold text-[#191c1e]">{horse.name}</span>
        {(horse.recentCount ?? 0) > 0 && (
          <span className="text-[10px] font-semibold text-[#444650] bg-[#e8edf4] px-1.5 py-0.5 rounded">
            {horse.recentCount}×
          </span>
        )}
      </label>
      {checked && (
        <div className="px-3 pb-2.5">
          <input
            value={notes}
            onChange={e => onNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] bg-[#f7f9fc]"
          />
        </div>
      )}
    </li>
  )
}

function todayLocalInput(): string {
  const d = new Date()
  // Format for <input type="datetime-local"> — YYYY-MM-DDTHH:MM in local tz.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
