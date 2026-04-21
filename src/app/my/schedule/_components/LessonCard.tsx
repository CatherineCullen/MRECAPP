'use client'

import { useState, useTransition } from 'react'
import { cancelMyLesson, requestCancellationException, type CancelOutcome } from '../actions'

type Props = {
  lessonRiderId: string
  scheduledAt:   string   // ISO string
  instructorName: string
  lessonType:    'private' | 'semi_private' | 'group'
  isMakeup:      boolean
  hoursUntil:    number   // computed server-side, passed in for display logic
  riderName?:    string | null
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

const LESSON_LABEL = {
  private:      'Private',
  semi_private: 'Semi-Private',
  group:        'Group',
}

export default function LessonCard({
  lessonRiderId, scheduledAt, instructorName, lessonType, isMakeup, hoursUntil, riderName,
}: Props) {
  const [expanded,    setExpanded]    = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [reason,      setReason]      = useState('')
  const [outcome,     setOutcome]     = useState<CancelOutcome | 'exception_sent' | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [pending,     start]          = useTransition()

  const isLate       = hoursUntil < 24
  const isCancelled  = outcome !== null

  function handleCancel() {
    start(async () => {
      if (isLate) {
        // Late: treat as exception request if they add a reason, else straight cancel
        const res = reason.trim()
          ? await requestCancellationException(lessonRiderId, reason)
          : await cancelMyLesson(lessonRiderId)
        if (res.error) { setError(res.error); return }
        setOutcome(reason.trim() ? 'exception_sent' : 'cancelled_late')
      } else {
        const res = await cancelMyLesson(lessonRiderId, reason || undefined)
        if (res.error) { setError(res.error); return }
        setOutcome(res.outcome ?? 'cancelled_late')
      }
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
          <p className="text-xs text-on-surface-muted mt-1">You've used your 2 free cancellations this quarter — no makeup credit for this one.</p>
        )}
        {outcome === 'cancelled_late' && (
          <p className="text-xs text-on-surface-muted mt-1">Less than 24 hours — no makeup credit generated. Contact the barn if you need an exception.</p>
        )}
        {outcome === 'exception_sent' && (
          <p className="text-xs text-on-surface-muted mt-1">Cancelled. Your note has been sent to the barn — they'll be in touch about a credit.</p>
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
          {isLate && !confirming && (
            <span className="text-[10px] font-semibold bg-error-container text-error px-1.5 py-0.5 rounded uppercase tracking-wide">
              &lt;24h
            </span>
          )}
        </div>
      </div>

      {/* Expanded: cancel flow */}
      {expanded && !confirming && (
        <div className="mt-3 pt-3 border-t border-outline-variant/20" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setConfirming(true)}
            className="text-sm font-semibold text-error"
          >
            Cancel this lesson
          </button>
        </div>
      )}

      {confirming && (
        <div className="mt-3 pt-3 border-t border-outline-variant/20" onClick={e => e.stopPropagation()}>
          {isLate ? (
            <p className="text-sm text-on-surface mb-2">
              This lesson is less than 24 hours away. Cancelling now won't generate a makeup credit.
              You can add a note below and the barn will decide if an exception applies.
            </p>
          ) : (
            <p className="text-sm text-on-surface mb-2">
              Are you sure you want to cancel this lesson?
            </p>
          )}
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isLate ? 'Explain your situation (optional)…' : 'Add a note for the barn (optional)…'}
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
              {pending ? 'Cancelling…' : isLate && reason.trim() ? 'Cancel & send note' : 'Yes, cancel'}
            </button>
            <button
              onClick={() => { setConfirming(false); setReason(''); setError(null) }}
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
