'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelLesson, markNoShow, revertLesson } from '../actions'

type Props = {
  lessonId:      string
  status:        string
  scheduledAt:   string        // ISO timestamp
  hasBoarder:    boolean       // any rider on a boarder subscription?
  isMultiRider?: boolean       // when true, per-rider cancel UI takes over and
                               // we suppress the whole-lesson cancel buttons
  /** Number of rider-cancel-sourced makeup tokens this rider already has this
   *  quarter (single-rider lessons only). Used to surface a soft warning when
   *  cancelling would be the 3rd+ rider-cancel this quarter. Standard-sub
   *  allowance is 2 — boarders are unlimited and skip this check upstream. */
  riderCancelAllowanceUsed?: number
}

export default function LessonActions({
  lessonId, status, scheduledAt, hasBoarder, isMultiRider = false, riderCancelAllowanceUsed = 0,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError]          = useState<string | null>(null)
  const [mode, setMode]            = useState<'idle' | 'cancel-rider' | 'cancel-barn'>('idle')

  // Cancel form state
  const [reason, setReason]       = useState('')
  const [grantToken, setGrantToken] = useState(true)

  const isTerminal = status === 'completed' || status === 'cancelled_rider' || status === 'cancelled_barn' || status === 'no_show'
  const isPast     = new Date(scheduledAt) < new Date()
  // A scheduled lesson in the past is "effectively completed" — no more
  // cancel flow makes sense after the fact. Only No-Show is useful
  // (admin retroactively marking the rider didn't show).
  const isEffectivelyDone = !isTerminal && isPast

  // Default grantToken based on the ≥24hr rule whenever the rider-cancel dialog opens
  function openRiderCancel() {
    const hoursUntil = (new Date(scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60)
    // Default: token if ≥24h out. Boarders always default to token. Admin can override.
    setGrantToken(hasBoarder || hoursUntil >= 24)
    setReason('')
    setMode('cancel-rider')
    setError(null)
  }

  function openBarnCancel() {
    setGrantToken(true)  // Barn-cancel always defaults to granting tokens
    setReason('')
    setMode('cancel-barn')
    setError(null)
  }

  function handleNoShow() {
    setError(null)
    startTransition(async () => {
      const r = await markNoShow(lessonId)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  function handleCancelSubmit() {
    setError(null)
    startTransition(async () => {
      const r = await cancelLesson({
        lessonId,
        cancelledBy: mode === 'cancel-barn' ? 'barn' : 'rider',
        reason,
        grantTokens: grantToken,
      })
      if (r?.error) setError(r.error)
      else {
        setMode('idle')
        router.refresh()
      }
    })
  }

  function handleRevert() {
    setError(null)
    startTransition(async () => {
      const r = await revertLesson(lessonId)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  // Consistent outlined-button style for all terminal actions
  const btnCancelCls  = 'text-xs font-semibold text-[#8a1a1a] border border-[#ffd6d6] bg-white px-3 py-1.5 rounded hover:bg-[#ffd6d6]/30 disabled:opacity-50 transition-colors'
  const btnNoShowCls  = 'text-xs font-semibold text-[#7a5a00] border border-[#fff4d6] bg-white px-3 py-1.5 rounded hover:bg-[#fff4d6]/60 disabled:opacity-50 transition-colors'

  if (isTerminal) {
    const stateWord =
      status === 'completed'       ? 'completed' :
      status === 'no_show'         ? 'marked as no-show' :
      status === 'cancelled_barn'  ? 'cancelled (barn)' :
                                     'cancelled (rider)'
    return (
      <div>
        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
        <p className="text-xs text-[#444650] mb-2">
          This lesson is {stateWord}. You can undo to restore it to Scheduled.
          {(status === 'cancelled_rider' || status === 'cancelled_barn') && ' Any makeup tokens generated from this cancellation will be removed.'}
        </p>
        <button
          onClick={handleRevert}
          disabled={pending}
          className="text-xs font-semibold text-[#002058] border border-[#c4c6d1] bg-white px-3 py-1.5 rounded hover:border-[#002058] hover:bg-[#f7f9fc] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Undoing…' : '↶ Undo'}
        </button>
      </div>
    )
  }

  if (mode === 'idle') {
    return (
      <div>
        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

        {isEffectivelyDone && (
          <p className="text-xs text-[#444650] mb-2">
            This lesson is in the past and wasn't cancelled — it's complete. You can still record a no-show if needed.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Cancel flows only for lessons that haven't happened yet. For
              multi-rider lessons we hide these and show per-rider cancel
              buttons inline next to each rider instead — otherwise cancelling
              the whole lesson when you meant one person is too easy. */}
          {!isEffectivelyDone && !isMultiRider && (
            <>
              <button onClick={openRiderCancel} disabled={pending} className={btnCancelCls}>
                Cancel — Rider
              </button>
              <button onClick={openBarnCancel}  disabled={pending} className={btnCancelCls}>
                Cancel — Barn
              </button>
            </>
          )}
          {!isEffectivelyDone && isMultiRider && (
            <p className="text-xs text-[#444650]">
              This lesson has multiple riders — use the Cancel / No-Show buttons next to each rider above.
            </p>
          )}
          {/* Whole-lesson No-Show only makes sense for single-rider lessons.
              For multi-rider, each rider has their own No-Show inline. */}
          {!isMultiRider && (
            <button onClick={handleNoShow} disabled={pending} className={btnNoShowCls}>
              No-Show
            </button>
          )}
        </div>
      </div>
    )
  }

  const isBarn = mode === 'cancel-barn'
  const showAllowanceWarning = !isBarn && riderCancelAllowanceUsed >= 2

  return (
    <div className="border border-[#c4c6d1] rounded-lg p-3 bg-[#f7f9fc]">
      <div className="text-sm font-bold text-[#191c1e] mb-2">
        {isBarn ? 'Cancel Lesson — Barn' : 'Cancel Lesson — Rider'}
      </div>

      {showAllowanceWarning && (
        <div className="mb-2 px-2 py-1.5 bg-[#fff4d6] border border-[#ffddb3] rounded text-[11px] text-[#7a5a00] leading-snug">
          <span className="font-semibold">Heads up:</span> this rider has already used {riderCancelAllowanceUsed} rider-cancel token{riderCancelAllowanceUsed === 1 ? '' : 's'} this quarter (policy allows 2). Proceeding will generate an additional token unless you uncheck below.
        </div>
      )}

      <label className="block text-xs font-semibold text-[#191c1e] mb-1">Reason</label>
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder={isBarn ? 'e.g., Instructor illness, arena flooded' : 'e.g., Sick, family trip'}
        className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white mb-2"
      />

      <label className="flex items-center gap-2 text-xs text-[#191c1e] mb-3">
        <input
          type="checkbox"
          checked={grantToken}
          onChange={e => setGrantToken(e.target.checked)}
          className="accent-[#002058]"
        />
        <span>Grant makeup token{isBarn ? ' (barn cancel — recommended)' : ''}</span>
      </label>

      {error && <div className="mb-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          onClick={handleCancelSubmit}
          disabled={pending}
          className="bg-[#8a1a1a] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#6a1010] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Cancelling…' : 'Confirm Cancel'}
        </button>
        <button
          onClick={() => setMode('idle')}
          disabled={pending}
          className="text-xs font-semibold text-[#444650] px-3 py-1.5 rounded hover:bg-[#e8eaf0] transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  )
}
