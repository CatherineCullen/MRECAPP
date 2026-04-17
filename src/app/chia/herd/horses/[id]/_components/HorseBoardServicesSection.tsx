'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logBoardServices } from '@/lib/boardServiceLogging'

export type HorseBoardLog = {
  id:             string
  logged_at:      string
  logged_by_label:string | null
  log_source:     'qr_code' | 'app' | 'admin'
  unit_price:     number | null
  is_billable:    boolean
  notes:          string | null
  status:         'logged' | 'pending_review' | 'reviewed' | 'invoiced' | 'voided'
  service:        { id: string; name: string } | null
}

export type BoardServiceOption = {
  id:          string
  name:        string
  is_billable: boolean
}

/**
 * Board Services section on a horse record. Shows the last N logged services
 * — visibility-only per the plan (no reconciliation, no flags). Admins can
 * back-fill a missed log here via the Add log button; those entries get
 * log_source='admin' and skip QR attribution.
 */
export default function HorseBoardServicesSection({
  horseId,
  horseName,
  logs,
  services,
  currentUserName,
}: {
  horseId:         string
  horseName:       string
  logs:            HorseBoardLog[]
  services:        BoardServiceOption[]
  currentUserName: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding]     = useState(false)
  const [showVoided, setShowVoided] = useState(false)

  const visible = showVoided ? logs : logs.filter(l => l.status !== 'voided')
  const preview = visible.slice(0, expanded ? visible.length : 3)

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Board Services
          <span className="ml-1.5 text-[10px] font-normal text-[#444650] normal-case tracking-normal">
            ({visible.length})
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVoided(v => !v)}
            className="text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            {showVoided ? 'Hide voided' : 'Show voided'}
          </button>
          <button
            onClick={() => setAdding(a => !a)}
            className="text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-2.5 py-1 rounded transition-colors"
          >
            {adding ? 'Close' : '+ Add log'}
          </button>
        </div>
      </div>

      {adding && (
        <AddLogForm
          horseId={horseId}
          horseName={horseName}
          services={services}
          currentUserName={currentUserName}
          onDone={() => setAdding(false)}
        />
      )}

      <div className="px-4 pt-1 pb-2">
        {visible.length === 0 && (
          <div className="py-3 text-xs text-[#444650] italic">No services logged yet.</div>
        )}
        {preview.map(l => <LogRow key={l.id} log={l} />)}
        {visible.length > 3 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            {expanded ? 'Show less' : `Show ${visible.length - 3} more`}
          </button>
        )}
      </div>
    </section>
  )
}

function LogRow({ log }: { log: HorseBoardLog }) {
  const d   = new Date(log.logged_at)
  const dt  = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const tm  = d.toLocaleTimeString('en-US',  { hour: 'numeric', minute: '2-digit' })
  const voided = log.status === 'voided'

  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 border-b border-[#f2f4f7] last:border-0 ${voided ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${voided ? 'line-through text-[#444650]' : 'text-[#191c1e]'}`}>
            {log.service?.name ?? '—'}
          </span>
          <span className="text-xs text-[#444650]">{dt} · {tm}</span>
          <StatusBadge status={log.status} billable={log.is_billable} />
        </div>
        <div className="text-[10px] text-[#444650] mt-0.5">
          {log.logged_by_label && <span>{log.logged_by_label} · </span>}
          <span className="capitalize">{log.log_source.replace('_', ' ')}</span>
        </div>
        {log.notes && (
          <p className="mt-0.5 text-xs text-[#444650] italic">{log.notes}</p>
        )}
      </div>
      {log.is_billable && log.unit_price !== null && !voided && (
        <span className="shrink-0 text-xs font-semibold text-[#191c1e] whitespace-nowrap">
          ${Number(log.unit_price).toFixed(2)}
        </span>
      )}
    </div>
  )
}

function StatusBadge({ status, billable }: { status: HorseBoardLog['status']; billable: boolean }) {
  if (!billable && status === 'logged') {
    // Non-billable logs don't need a chip — they're the common case.
    return null
  }
  const styles: Record<typeof status, string> = {
    logged:         'bg-[#e0e3e6] text-[#444650]',
    pending_review: 'bg-[#ffddb3] text-[#7c4b00]',
    reviewed:       'bg-[#b7d9f0] text-[#002058]',
    invoiced:       'bg-[#b7f0d0] text-[#1a6b3c]',
    voided:         'bg-[#e0e3e6] text-[#444650]',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${styles[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function AddLogForm({
  horseId, horseName, services, currentUserName, onDone,
}: {
  horseId:         string
  horseName:       string
  services:        BoardServiceOption[]
  currentUserName: string
  onDone:          () => void
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
        loggedByLabel: currentUserName || 'Admin',
        logSource:     'admin',
      })
      if (r.error) { setError(r.error); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <div className="bg-[#f7f9fc] border-b border-[#c4c6d1]/40 px-4 py-3">
      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-2">
        Back-fill a log for {horseName}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-start">
        <select
          value={serviceId}
          onChange={e => setServiceId(e.target.value)}
          className="text-xs border border-[#c4c6d1] rounded px-2 py-1.5 bg-white"
        >
          <option value="">Service…</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} {s.is_billable ? '(billable)' : ''}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-xs border border-[#c4c6d1] rounded px-2 py-1.5 bg-white"
        />
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="text-xs border border-[#c4c6d1] rounded px-2 py-1.5 bg-white"
        />
        <button
          onClick={submit}
          disabled={pending}
          className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] disabled:opacity-50"
        >
          {pending ? 'Logging…' : 'Log'}
        </button>
      </div>
      {error && <div className="text-[10px] text-red-700 mt-1">{error}</div>}
    </div>
  )
}

function todayLocalInput(): string {
  const d   = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
