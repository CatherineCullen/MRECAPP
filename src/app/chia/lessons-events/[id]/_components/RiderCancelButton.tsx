'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelRider } from '../actions'

type Props = {
  lessonId:      string
  lessonRiderId: string
  scheduledAt:   string
  hasBoarder:    boolean        // is this rider on a boarder subscription?
  hasSubscription: boolean      // only subs back tokens; one-off riders can't get one
  /** Rider-cancel tokens already issued to this rider this quarter. Used
   *  to surface a soft warning at count >= 2 (standard-sub allowance is 2).
   *  Upstream passes 0 for boarders so they never see the warning. */
  riderCancelAllowanceUsed?: number
}

/**
 * Per-rider cancel flow. Appears next to each rider on a multi-rider lesson.
 * For single-rider lessons the top-level LessonActions Cancel buttons are used
 * instead — they wrap the same effect with cleaner copy.
 */
export default function RiderCancelButton({
  lessonId, lessonRiderId, scheduledAt, hasBoarder, hasSubscription, riderCancelAllowanceUsed = 0,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode]   = useState<'idle' | 'rider' | 'barn'>('idle')
  const [reason, setReason]       = useState('')
  const [grantToken, setGrantToken] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function open(which: 'rider' | 'barn') {
    const hoursUntil = (new Date(scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60)
    if (which === 'rider') {
      // Mirror the whole-lesson rule: token if ≥24h out, boarders always
      setGrantToken(hasSubscription && (hasBoarder || hoursUntil >= 24))
    } else {
      setGrantToken(hasSubscription)
    }
    setReason('')
    setMode(which)
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await cancelRider({
        lessonId,
        lessonRiderId,
        cancelledBy: mode === 'barn' ? 'barn' : 'rider',
        reason,
        grantToken:  grantToken && hasSubscription,
      })
      if (r?.error) setError(r.error)
      else {
        setMode('idle')
        router.refresh()
      }
    })
  }

  // No-show is a rider-side cancellation with no token granted. We send it
  // directly without opening the form — matches the lesson-level No-Show UX.
  function submitNoShow() {
    setError(null)
    startTransition(async () => {
      const r = await cancelRider({
        lessonId,
        lessonRiderId,
        cancelledBy: 'rider',
        reason:      'No-show',
        grantToken:  false,
      })
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  if (mode === 'idle') {
    return (
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => open('rider')}
          disabled={pending}
          className="text-[10px] font-semibold text-[#8a1a1a] border border-[#ffd6d6] bg-white px-1.5 py-0.5 rounded hover:bg-[#ffd6d6]/30 transition-colors"
          title="Cancel this rider's attendance (lesson continues for others)"
        >
          Cancel — Rider
        </button>
        <button
          type="button"
          onClick={() => open('barn')}
          disabled={pending}
          className="text-[10px] font-semibold text-[#8a1a1a] border border-[#ffd6d6] bg-white px-1.5 py-0.5 rounded hover:bg-[#ffd6d6]/30 transition-colors"
          title="Barn cancels this rider's slot"
        >
          Cancel — Barn
        </button>
        <button
          type="button"
          onClick={submitNoShow}
          disabled={pending}
          className="text-[10px] font-semibold text-[#7a5a00] border border-[#fff4d6] bg-white px-1.5 py-0.5 rounded hover:bg-[#fff4d6]/60 transition-colors"
          title="Rider didn't show up — no token granted"
        >
          No-Show
        </button>
        {error && <span className="text-[10px] text-red-700">{error}</span>}
      </div>
    )
  }

  const isBarn = mode === 'barn'
  const showAllowanceWarning = !isBarn && riderCancelAllowanceUsed >= 2
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 border border-[#c4c6d1] rounded px-1.5 py-1 bg-[#f7f9fc]">
      {showAllowanceWarning && (
        <span
          className="w-full text-[10px] text-[#7a5a00] bg-[#fff4d6] border border-[#ffddb3] rounded px-1.5 py-0.5 leading-snug"
          title="Policy: 2 rider-cancel tokens per quarter for standard subscriptions"
        >
          ⚠ {riderCancelAllowanceUsed} rider-cancel token{riderCancelAllowanceUsed === 1 ? '' : 's'} this quarter — over the 2-per-quarter allowance.
        </span>
      )}
      <span className="text-[10px] font-semibold text-[#191c1e]">
        {isBarn ? 'Barn cancel' : 'Rider cancel'}
      </span>
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="reason"
        className="text-[10px] border border-[#c4c6d1] rounded px-1 py-0.5 w-24 focus:outline-none focus:border-[#002058]"
      />
      {hasSubscription ? (
        <label className="flex items-center gap-1 text-[10px] text-[#191c1e] cursor-pointer">
          <input
            type="checkbox"
            checked={grantToken}
            onChange={e => setGrantToken(e.target.checked)}
            className="accent-[#002058]"
          />
          token
        </label>
      ) : (
        <span className="text-[10px] text-[#c4c6d1]" title="Only subscription riders can receive tokens">
          no token
        </span>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="text-[10px] font-semibold text-white bg-[#8a1a1a] px-1.5 py-0.5 rounded hover:bg-[#6a1010] disabled:opacity-50"
      >
        {pending ? '…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setMode('idle')}
        disabled={pending}
        className="text-[10px] text-[#444650] hover:text-[#191c1e]"
      >
        ×
      </button>
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </div>
  )
}
