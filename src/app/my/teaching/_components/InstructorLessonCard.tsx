'use client'

import { useState, useTransition } from 'react'
import { cancelInstructorLesson, updateHorseAssignment } from '../actions'

export type HorseOption = { id: string; barnName: string; isLessonHorse: boolean }

export type InstructorLesson = {
  lessonId: string
  scheduledAt: string
  lessonType: 'private' | 'semi_private' | 'group'
  durationMinutes: number
  isFuture: boolean
  riders: Array<{
    lrId: string
    name: string
    phone: string | null
    isMinor: boolean
    guardianName: string | null
    guardianPhone: string | null
    horseId: string | null
    horseName: string | null
    subscriptionType: string | null
    subscriptionSlot: string | null
    makeupTokenCount: number
  }>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

const LESSON_LABEL = {
  private:      'Private · 30 min',
  semi_private: 'Semi-Private · 45 min',
  group:        'Group · 60 min',
}

export default function InstructorLessonCard({
  lesson,
  horses,
}: {
  lesson: InstructorLesson
  horses: HorseOption[]
}) {
  const [expanded,    setExpanded]    = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [cancelled,   setCancelled]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [horseError,  setHorseError]  = useState<string | null>(null)
  const [pending,     start]          = useTransition()
  const [horsePending, startHorse]    = useTransition()

  // Per-rider local horse state so the picker reflects optimistic changes
  const [localHorses, setLocalHorses] = useState<Record<string, string | null>>(
    Object.fromEntries(lesson.riders.map(r => [r.lrId, r.horseId]))
  )

  const activeRiders = lesson.riders.filter(r => r.horseName !== undefined)
  const firstRider   = activeRiders[0]
  // Use local horse state for display
  const displayHorseName = firstRider
    ? (localHorses[firstRider.lrId] !== undefined
        ? horses.find(h => h.id === localHorses[firstRider.lrId])?.barnName ?? null
        : firstRider.horseName)
    : null

  function handleHorseChange(lrId: string, newHorseId: string | null) {
    setLocalHorses(prev => ({ ...prev, [lrId]: newHorseId }))
    setHorseError(null)
    startHorse(async () => {
      const res = await updateHorseAssignment(lrId, newHorseId)
      if (res.error) { setHorseError(res.error); return }
    })
  }

  const lessonHorses  = horses.filter(h => h.isLessonHorse)
  const otherHorses   = horses.filter(h => !h.isLessonHorse)

  function handleCancel() {
    start(async () => {
      const res = await cancelInstructorLesson(lesson.lessonId)
      if (res.error) { setError(res.error); return }
      setCancelled(true)
      setConfirming(false)
    })
  }

  if (cancelled) {
    return (
      <div className="bg-surface-lowest rounded-lg px-4 py-3 opacity-60">
        <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          {formatDate(lesson.scheduledAt)} · {formatTime(lesson.scheduledAt)}
        </p>
        <p className="text-sm font-bold text-on-surface mt-0.5">Lesson cancelled</p>
        <p className="text-xs text-on-surface-muted mt-1">Riders have been issued a makeup credit.</p>
      </div>
    )
  }

  return (
    <div
      className="bg-surface-lowest rounded-lg px-4 py-3 cursor-pointer select-none"
      onClick={() => { if (!confirming) setExpanded(e => !e) }}
    >
      {/* Collapsed view */}
      <p className="text-base font-bold text-on-surface">
        {formatTime(lesson.scheduledAt)}
      </p>

      <div className="flex items-center gap-2 mt-1">
        {displayHorseName ? (
          <span className="text-sm font-semibold text-on-surface">{displayHorseName}</span>
        ) : (
          <span className="text-sm font-semibold text-warning">No horse assigned</span>
        )}
        <span className="text-on-surface-muted text-sm">·</span>
        <span className="text-sm text-on-surface-muted">
          {activeRiders.map(r => r.name).join(' & ')}
        </span>
      </div>

      <p className="text-xs text-on-surface-muted mt-0.5">{LESSON_LABEL[lesson.lessonType]}</p>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-outline-variant/20 space-y-3"
          onClick={e => e.stopPropagation()}
        >
          {activeRiders.map(r => (
            <div key={r.lrId} className="space-y-1">
              <p className="text-sm font-semibold text-on-surface">{r.name}</p>

              {/* Contact info */}
              {r.isMinor ? (
                r.guardianPhone ? (
                  <a
                    href={`tel:${r.guardianPhone}`}
                    className="block text-sm text-on-secondary-container font-semibold"
                    onClick={e => e.stopPropagation()}
                  >
                    {r.guardianName ?? 'Guardian'} · {r.guardianPhone}
                  </a>
                ) : (
                  <p className="text-xs text-on-surface-muted">No guardian contact on file</p>
                )
              ) : r.phone ? (
                <a
                  href={`tel:${r.phone}`}
                  className="block text-sm text-on-secondary-container font-semibold"
                  onClick={e => e.stopPropagation()}
                >
                  {r.phone}
                </a>
              ) : (
                <p className="text-xs text-on-surface-muted">No phone on file</p>
              )}

              {/* Horse assignment */}
              {lesson.isFuture && (
                <div className="mt-1">
                  <select
                    value={localHorses[r.lrId] ?? ''}
                    disabled={horsePending}
                    onChange={e => handleHorseChange(r.lrId, e.target.value || null)}
                    className="w-full bg-surface-highest rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none disabled:opacity-50"
                  >
                    <option value="">No horse assigned</option>
                    {lessonHorses.length > 0 && (
                      <optgroup label="Lesson horses">
                        {lessonHorses.map(h => (
                          <option key={h.id} value={h.id}>{h.barnName}</option>
                        ))}
                      </optgroup>
                    )}
                    {otherHorses.length > 0 && (
                      <optgroup label="All horses">
                        {otherHorses.map(h => (
                          <option key={h.id} value={h.id}>{h.barnName}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {horseError && <p className="text-xs text-error mt-1">{horseError}</p>}
                </div>
              )}

              {/* Subscription info */}
              {r.subscriptionSlot && (
                <p className="text-xs text-on-surface-muted mt-1">{r.subscriptionSlot}</p>
              )}
              {r.makeupTokenCount > 0 && (
                <p className="text-xs text-warning font-semibold">
                  {r.makeupTokenCount} unscheduled makeup{r.makeupTokenCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))}

          {/* Cancel action — future lessons only */}
          {lesson.isFuture && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="text-sm font-semibold text-error pt-1"
            >
              Cancel this lesson
            </button>
          )}

          {confirming && (
            <div className="space-y-2 pt-1">
              <p className="text-sm text-on-surface">
                Cancel this lesson? All riders will receive a makeup credit.
              </p>
              {error && <p className="text-xs text-error">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  disabled={pending}
                  className="btn-primary text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50"
                >
                  {pending ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button
                  onClick={() => { setConfirming(false); setError(null) }}
                  className="text-sm font-semibold text-on-secondary-container"
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
