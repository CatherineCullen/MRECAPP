'use client'

import { useState, useTransition } from 'react'
import { updateHorseAssignment, updateLessonNote } from '../actions'

export type HorseOption = { id: string; barnName: string; isLessonHorse: boolean }

export type InstructorLesson = {
  lessonId: string
  scheduledAt: string
  lessonType: 'private' | 'semi_private' | 'group'
  durationMinutes: number
  isFuture: boolean
  notes: string | null
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
  const [horseError,  setHorseError]  = useState<string | null>(null)
  const [horsePending, startHorse]    = useTransition()

  const [note,        setNote]        = useState(lesson.notes ?? '')
  const [noteSaved,   setNoteSaved]   = useState(lesson.notes ?? '')
  const [noteError,   setNoteError]   = useState<string | null>(null)
  const [notePending, startNote]      = useTransition()

  const [localHorses, setLocalHorses] = useState<Record<string, string | null>>(
    Object.fromEntries(lesson.riders.map(r => [r.lrId, r.horseId]))
  )

  const activeRiders = lesson.riders
  const firstRider   = activeRiders[0]
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

  function handleNoteBlur() {
    if (note === noteSaved) return
    setNoteError(null)
    const value = note
    startNote(async () => {
      const res = await updateLessonNote(lesson.lessonId, value)
      if (res.error) { setNoteError(res.error); return }
      setNoteSaved(value)
    })
  }

  const lessonHorses  = horses.filter(h => h.isLessonHorse)
  const otherHorses   = horses.filter(h => !h.isLessonHorse)
  const hasNote = (lesson.notes ?? '').trim().length > 0

  return (
    <div
      className="bg-surface-lowest rounded-lg px-4 py-3 cursor-pointer select-none"
      onClick={() => setExpanded(e => !e)}
    >
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
        {hasNote && (
          <span className="text-[10px] font-bold text-on-secondary-container uppercase tracking-wider">Note</span>
        )}
      </div>

      <p className="text-xs text-on-surface-muted mt-0.5">{LESSON_LABEL[lesson.lessonType]}</p>

      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-outline-variant/20 space-y-3"
          onClick={e => e.stopPropagation()}
        >
          {activeRiders.map(r => (
            <div key={r.lrId} className="space-y-1">
              <p className="text-sm font-semibold text-on-surface">{r.name}</p>

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

          {/* Instructor note */}
          <div className="pt-1">
            <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">
              Note <span className="font-normal normal-case tracking-normal">(not visible to riders)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              onBlur={handleNoteBlur}
              disabled={notePending}
              rows={2}
              placeholder="Add a note for this lesson…"
              className="mt-1 w-full bg-surface-highest rounded px-2 py-1.5 text-sm text-on-surface focus:outline-none disabled:opacity-50 resize-none"
            />
            <div className="flex items-center justify-between mt-0.5 min-h-[14px]">
              {noteError ? (
                <span className="text-xs text-error">{noteError}</span>
              ) : notePending ? (
                <span className="text-[11px] text-on-surface-muted">Saving…</span>
              ) : note !== noteSaved ? (
                <span className="text-[11px] text-on-surface-muted">Unsaved</span>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
