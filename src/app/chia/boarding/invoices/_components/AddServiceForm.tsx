'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logBoardServices } from '@/lib/boardServiceLogging'
import type { BoardServiceOption } from '../_lib/loadQueue'

/**
 * Per-horse "Add service" form.
 *
 * Admin picks a billable service from the catalog, sets a date (defaults
 * to now), adds optional notes. This writes a board_service_log +
 * horse_event — the same entry point used from the horse profile — so
 * provenance is clean. On next page load the seeder stages it as a draft
 * billing_line_item.
 *
 * Picker is filtered to billable services only; non-billable logs are
 * logged from the horse profile, where that distinction matters.
 *
 * Mirrors the horse-profile AddLogForm UX so admins build one muscle
 * memory regardless of which surface they're on.
 *


 */

function todayLocalInput(): string {
  const d   = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AddServiceForm({
  horseId,
  horseName,
  services,
  userLabel,
  onDone,
}: {
  horseId:    string
  horseName:  string
  services:   BoardServiceOption[]
  userLabel:  string
  onDone:     () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [serviceId, setServiceId] = useState('')
  const [date, setDate]           = useState(todayLocalInput())
  const [notes, setNotes]         = useState('')
  const [error, setError]         = useState<string | null>(null)

  function submit() {
    setError(null)
    if (!serviceId) { setError('Pick a service'); return }
    startTransition(async () => {
      const r = await logBoardServices({
        serviceId,
        horses:        [{ horseId, notes }],
        loggedAt:      new Date(date).toISOString(),
        loggedByLabel: userLabel,
        logSource:     'admin',
      })
      if (r.error) { setError(r.error); return }
      onDone()
      // router.refresh() picks up the new log via the seeder on reload.
      router.refresh()
    })
  }

  return (
    <div className="bg-[#f7f9fc] border-t border-[#e8ecf5] p-3 space-y-2">
      <div className="flex items-baseline gap-3">
        <h3 className="text-[#191c1e] font-semibold text-sm">
          Log a service for {horseName}
        </h3>
        <span className="text-xs text-[#8c8e98]">
          From the catalog — price snapshots at log time
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="text-xs text-[#8c8e98] hover:text-[#444650] disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-start">
        <select
          value={serviceId}
          onChange={e => setServiceId(e.target.value)}
          className="text-sm border border-[#c4c6d1] rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#002058]"
        >
          <option value="">Service…</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.unitPrice !== null ? ` — $${s.unitPrice.toFixed(2)}` : ''}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-sm border border-[#c4c6d1] rounded px-2 py-1.5 bg-white font-mono focus:outline-none focus:border-[#002058]"
        />
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="text-sm border border-[#c4c6d1] rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#002058]"
        />
        <button
          onClick={submit}
          disabled={pending || !serviceId}
          className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#001540] disabled:opacity-40"
        >
          {pending ? 'Logging…' : 'Log'}
        </button>
      </div>

      {error && <div className="text-xs text-[#8f3434]">{error}</div>}
    </div>
  )
}
