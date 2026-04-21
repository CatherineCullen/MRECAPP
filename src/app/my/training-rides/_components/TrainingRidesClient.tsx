'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export type RideRow = {
  id:        string
  status:    'scheduled' | 'logged'
  notes:     string | null
  horseName: string
}

export type HorseLite = {
  horseId:     string
  name:        string
  recentCount?: number
}

export type TrainingRideActions = {
  logRide:        (rideId: string, notes: string) => Promise<{ error?: string }>
  unlogRide:      (rideId: string) => Promise<{ error?: string }>
  addLoggedRide:  (args: { horseId: string; date: string; notes: string }) => Promise<{ error?: string }>
  scheduleRide?:  (args: { horseId: string; date: string }) => Promise<{ error?: string }>
  unscheduleRide?: (rideId: string) => Promise<{ error?: string }>
}

type DayMode = 'past' | 'today' | 'future'

export default function TrainingRidesClient({
  date, rides, recentHorses, allHorses, basePath, actions, providerName,
}: {
  date:         string
  rides:        RideRow[]
  recentHorses: { horseId: string; name: string; recentCount: number }[]
  allHorses:    HorseLite[]
  basePath:     string
  actions:      TrainingRideActions
  providerName?: string
}) {
  const router = useRouter()
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)
  const [logNotes, setLogNotes] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [addingHorse, setAddingHorse] = useState<HorseLite | null>(null)
  const [addNotes, setAddNotes] = useState('')

  const today = todayDate()
  const mode: DayMode = date < today ? 'past' : date === today ? 'today' : 'future'
  const canSchedule = mode === 'future' && !!actions.scheduleRide

  function setDate(next: string) {
    router.push(`${basePath}?date=${next}`)
  }

  function shift(days: number) {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setDate(d.toISOString().slice(0, 10))
  }

  function confirmLog(rideId: string) {
    setError(null)
    startTransition(async () => {
      const r = await actions.logRide(rideId, logNotes)
      if (r.error) { setError(r.error); return }
      setOpenLogId(null)
      setLogNotes('')
      router.refresh()
    })
  }

  function confirmUnlog(rideId: string) {
    if (!confirm('Unlog this ride? It will go back to Scheduled.')) return
    setError(null)
    startTransition(async () => {
      const r = await actions.unlogRide(rideId)
      if (r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  function confirmUnschedule(rideId: string) {
    if (!actions.unscheduleRide) return
    if (!confirm('Remove this scheduled ride?')) return
    setError(null)
    startTransition(async () => {
      const r = await actions.unscheduleRide!(rideId)
      if (r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  function confirmAdd() {
    if (!addingHorse) return
    setError(null)
    startTransition(async () => {
      const r = canSchedule
        ? await actions.scheduleRide!({ horseId: addingHorse.horseId, date })
        : await actions.addLoggedRide({ horseId: addingHorse.horseId, date, notes: addNotes })
      if (r.error) { setError(r.error); return }
      setAddingHorse(null)
      setAddNotes('')
      router.refresh()
    })
  }

  const addVerb     = canSchedule ? 'Schedule' : 'Log'
  const addingVerb  = canSchedule ? 'Scheduling…' : 'Logging…'
  const sectionLabel = canSchedule ? 'Schedule a horse' : 'Log another horse'

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">
        {providerName ? `${providerName}'s training rides` : 'Training rides'}
      </h1>

      {/* Date picker */}
      <div className="bg-surface-lowest rounded-lg px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => shift(-1)}
          className="text-on-surface-muted text-sm font-semibold px-2 py-1 rounded hover:bg-surface-low"
          aria-label="Previous day"
        >
          ‹
        </button>
        <button
          onClick={() => {
            const el = dateInputRef.current
            if (!el) return
            if (typeof el.showPicker === 'function') el.showPicker()
            else el.click()
          }}
          className="flex-1 text-sm text-on-surface bg-surface-lowest border border-outline rounded px-2 py-1 focus:outline-none focus:border-primary text-center"
        >
          {mode === 'today' ? `Today · ${formatWeekday(date)}` : formatFull(date)}
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          onClick={() => shift(1)}
          className="text-on-surface-muted text-sm font-semibold px-2 py-1 rounded hover:bg-surface-low"
          aria-label="Next day"
        >
          ›
        </button>
        {mode !== 'today' && (
          <button
            onClick={() => setDate(today)}
            className="text-[11px] font-semibold text-on-secondary-container px-2"
          >
            Today
          </button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Rides for this date */}
      {rides.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-on-surface">
            No rides {canSchedule ? 'scheduled' : 'on'} this day.
          </p>
          <p className="text-xs text-on-surface-muted mt-1">
            {canSchedule ? 'Schedule one below.' : 'Log one below.'}
          </p>
        </div>
      ) : (
        <ul className="bg-surface-lowest rounded-lg overflow-hidden">
          {rides.map(r => (
            <li key={r.id} className="border-t border-outline/20 first:border-t-0 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-on-surface truncate">{r.horseName}</div>
                  <div className="text-[11px] text-on-surface-muted">
                    {r.status === 'logged' ? 'Logged ✓' : 'Scheduled'}
                    {r.notes && ` — ${r.notes}`}
                  </div>
                </div>
                {r.status === 'scheduled' && (
                  canSchedule ? (
                    actions.unscheduleRide && (
                      <button
                        onClick={() => confirmUnschedule(r.id)}
                        disabled={pending}
                        className="shrink-0 text-xs font-semibold text-on-surface-muted underline disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => { setOpenLogId(r.id === openLogId ? null : r.id); setLogNotes('') }}
                      disabled={pending}
                      className="shrink-0 text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
                    >
                      {openLogId === r.id ? 'Cancel' : 'Log'}
                    </button>
                  )
                )}
                {r.status === 'logged' && !canSchedule && (
                  <button
                    onClick={() => confirmUnlog(r.id)}
                    disabled={pending}
                    className="shrink-0 text-xs font-semibold text-on-surface-muted underline disabled:opacity-60"
                  >
                    Unlog
                  </button>
                )}
              </div>
              {openLogId === r.id && !canSchedule && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={logNotes}
                    onChange={e => setLogNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="flex-1 text-xs border border-outline rounded px-2 py-1.5 focus:outline-none focus:border-primary bg-surface-lowest"
                  />
                  <button
                    onClick={() => confirmLog(r.id)}
                    disabled={pending}
                    className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
                  >
                    {pending ? '…' : 'Confirm'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add another horse — hidden in past */}
      {sectionLabel && (
        <div className="bg-surface-lowest rounded-lg px-4 py-3">
          <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2">
            {sectionLabel}
          </h2>

          {addingHorse ? (
            <div className="space-y-2">
              <p className="text-sm text-on-surface">
                {canSchedule ? 'Schedule' : 'Log'} a ride on{' '}
                <span className="font-semibold">{addingHorse.name}</span> for {formatDate(date)}?
              </p>
              {!canSchedule && (
                <input
                  value={addNotes}
                  onChange={e => setAddNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full text-xs border border-outline rounded px-2 py-1.5 focus:outline-none focus:border-primary bg-surface-lowest"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={confirmAdd}
                  disabled={pending}
                  className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
                >
                  {pending ? addingVerb : `${addVerb} ride`}
                </button>
                <button
                  onClick={() => { setAddingHorse(null); setAddNotes('') }}
                  disabled={pending}
                  className="text-xs font-semibold text-on-surface-muted px-2 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {recentHorses.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1">
                    Recent (last 60 days)
                  </div>
                  <ul className="space-y-1 mb-2">
                    {recentHorses.map(h => (
                      <li key={h.horseId}>
                        <button
                          onClick={() => setAddingHorse({ horseId: h.horseId, name: h.name })}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-on-surface border border-outline/30 rounded hover:bg-surface-low"
                        >
                          <span>{h.name}</span>
                          <span className="text-[10px] font-semibold text-on-surface-muted bg-surface-low px-1.5 py-0.5 rounded">
                            {h.recentCount}×
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {!showAll && allHorses.length > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-xs font-semibold text-on-secondary-container border border-outline/30 rounded py-2 hover:bg-surface-low"
                >
                  + Another horse
                </button>
              )}

              {showAll && (
                <>
                  <div className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1 mt-2">
                    All horses
                  </div>
                  <ul className="space-y-1">
                    {allHorses.map(h => (
                      <li key={h.horseId}>
                        <button
                          onClick={() => setAddingHorse({ horseId: h.horseId, name: h.name })}
                          className="w-full text-left px-3 py-2 text-sm font-semibold text-on-surface border border-outline/30 rounded hover:bg-surface-low"
                        >
                          {h.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeekday(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

function formatFull(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
