'use client'

import { useState, useTransition } from 'react'
import { cancelMyLesson, type CancelOutcome } from '../actions'
import { BARN_TZ } from '@/lib/datetime'
import { openThreadWith } from '../../messages/actions'

type Props = {
  lessonRiderId: string
  lessonId:      string
  scheduledAt:   string   // ISO string
  instructorId:  string
  instructorName: string
  lessonType:    'private' | 'semi_private' | 'group'
  isMakeup:      boolean
  hoursUntil:    number   // computed server-side, passed in for display logic
  riderName?:    string | null
  /** Lesson row is status='pending' — slot is committed but not yet
   *  finalized. Could mean the lesson_month hasn't been invoiced, OR
   *  the invoice is sent but unpaid; we don't disambiguate on the
   *  rider side. Shown as a small "Pending" chip so the rider sees
   *  their upcoming commitment without misleading them about billing
   *  state. The chip drops once status flips to 'scheduled' (paid). */
  isPending?: boolean
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: BARN_TZ,
  })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    timeZone: BARN_TZ,
  })
}

const LESSON_LABEL = {
  private:      'Private',
  semi_private: 'Semi-Private',
  group:        'Group',
}

export default function LessonCard({
  lessonRiderId, lessonId, scheduledAt, instructorId, instructorName, lessonType, isMakeup, hoursUntil, riderName, isPending,
}: Props) {
  const [expanded,    setExpanded]    = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [note,        setNote]        = useState('')
  const [outcome,     setOutcome]     = useState<CancelOutcome | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [pending,     start]          = useTransition()

  const isLate       = hoursUntil < 24
  const isCancelled  = outcome !== null

  function handleCancel() {
    start(async () => {
      const res = await cancelMyLesson(lessonRiderId, note.trim() || undefined)
      if (res.error) { setError(res.error); return }
      setOutcome(res.outcome ?? 'cancelled_late')
      setConfirming(false)
    })
  }

  if (isCancelled) {
    return (
      <div className="bg-surface-lowest rounded-lg px-4 py-3 opacity-70">
        <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          {formatDate(scheduledAt)} · {formatTime(scheduledAt)}
        </p>
        <p className="text-sm font-bold text-on-surface mt-0.5">Lesson cancelled</p>
        {outcome === 'cancelled_with_token' && (
          <p className="text-xs text-success mt-1">A makeup credit has been added to your account.</p>
        )}
        {outcome === 'cancelled_no_allowance' && (
          <p className="text-xs text-on-surface-muted mt-1">You&apos;ve used your free cancellation this month — no makeup credit for this one.</p>
        )}
        {outcome === 'cancelled_late' && (
          <p className="text-xs text-on-surface-muted mt-1">Less than 24 hours — no makeup credit. {note.trim() ? "Your note was sent to the barn — they'll review for an exception." : 'Contact the barn if you need an exception.'}</p>
        )}
      </div>
    )
  }

  return (
    <div
      className="bg-surface-lowest rounded-lg px-4 py-3 cursor-pointer select-none"
      onClick={() => { if (!confirming) setExpanded(e => !e) }}
    >
      {/* Main row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide leading-tight">
            {formatDate(scheduledAt)}
          </p>
          <p className="text-base font-bold text-on-surface mt-0.5">
            {formatTime(scheduledAt)}
          </p>
          <p className="text-sm text-on-surface-muted mt-0.5">
            {riderName ? `${riderName} · ` : ''}{instructorName} · {LESSON_LABEL[lessonType]}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-0.5">
          {isMakeup && (
            <span className="text-[10px] font-semibold bg-warning-container text-warning px-1.5 py-0.5 rounded uppercase tracking-wide">
              Makeup
            </span>
          )}
          {isPending && (
            <span
              className="text-[10px] font-semibold bg-surface-highest text-on-surface-muted px-1.5 py-0.5 rounded uppercase tracking-wide"
              title="Future month — slot is reserved but not yet finalized"
            >
              Pending
            </span>
          )}
          {isLate && !confirming && (
            <span className="text-[10px] font-semibold bg-error-container text-error px-1.5 py-0.5 rounded uppercase tracking-wide">
              &lt;24h
            </span>
          )}
        </div>
      </div>

      {/* Expanded: action menu. Pending lessons (future-month rolling
          window, not yet finalized) hide the cancel button entirely —
          rider can only act on scheduled lessons. Spec: monthly-model-
          migration.md "Rider-side cancel button rule" — clear absence,
          not a disabled button. */}
      {expanded && !confirming && (
        <div className="mt-3 pt-3 border-t border-outline-variant/20 flex items-center gap-4" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => start(async () => { await openThreadWith({ recipientId: instructorId, lessonId }) })}
            disabled={pending}
            className="text-sm font-semibold text-secondary disabled:opacity-50"
          >
            Message {instructorName}
          </button>
          {!isPending && (
            <button
              onClick={() => setConfirming(true)}
              className="text-sm font-semibold text-error"
            >
              Cancel this lesson
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className="mt-3 pt-3 border-t border-outline-variant/20" onClick={e => e.stopPropagation()}>
          {isLate ? (
            <p className="text-sm text-on-surface mb-2">
              This lesson is less than 24 hours away. Cancelling now won&apos;t generate a makeup credit.
              Please add a note for your instructor and the office — the barn can grant an exception if appropriate.
            </p>
          ) : (
            <p className="text-sm text-on-surface mb-2">
              Cancel this lesson? Please add a note for your instructor and the office — even just a few words helps.
            </p>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`Note for ${instructorName} and the office (optional)…`}
            rows={2}
            className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface placeholder-on-surface-muted/60 focus:outline-none resize-none"
          />
          {error && <p className="text-xs text-error mt-1">{error}</p>}
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleCancel}
              disabled={pending}
              className="btn-primary text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50"
            >
              {pending ? 'Cancelling…' : note.trim() ? 'Cancel & send note' : 'Yes, cancel'}
            </button>
            <button
              onClick={() => { setConfirming(false); setNote(''); setError(null) }}
              className="text-sm font-semibold text-on-secondary-container"
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
