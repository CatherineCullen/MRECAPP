'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SearchPicker from '@/components/SearchPicker'
import { updateSubscription, cancelRemainingLessons } from '../../actions'

type Option = { id: string; name: string }

const DAY_LABEL: Record<string, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
}

function formatTime(t: string) {
  const [hStr, m] = t.split(':')
  const h = Number(hStr)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${period}`
}

type Props = {
  subscription: {
    id:                    string
    rider_name:            string
    instructor_name:       string
    quarter_label:         string
    lesson_day:            string
    lesson_time:           string
    billed_to_id:          string
    subscription_type:     'standard' | 'boarder'
    subscription_price:    number
    default_horse_id:      string | null
    default_horse_name:    string | null
    is_prorated:           boolean
    prorated_price:        number | null
    prorated_lesson_count: number | null
    status:                'pending' | 'active' | 'cancelled' | 'completed'
  }
  futureLessonCount: number
  billers: Option[]
  horses:  Option[]
}

export default function EditSubscriptionForm({ subscription: s, futureLessonCount, billers, horses }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)

  const [billedToId, setBilledToId]       = useState(s.billed_to_id)
  const [subType, setSubType]             = useState(s.subscription_type)
  const [price, setPrice]                 = useState(Number(s.subscription_price))
  const [horseId, setHorseId]             = useState(s.default_horse_id ?? '')
  const [cascadeHorse, setCascadeHorse]   = useState(true)
  const [isProrated, setIsProrated]       = useState(s.is_prorated)
  const [proratedPrice, setProratedPrice] = useState<number | ''>(s.prorated_price ?? '')
  const [proratedCount, setProratedCount] = useState<number | ''>(s.prorated_lesson_count ?? '')
  const [status, setStatus]               = useState(s.status)

  // Cancel-remaining dialog state
  const [confirming, setConfirming]   = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  // Admin can opt out of token issuance — covers the never-paid-and-backed-out
  // case and the rare refund-and-release case. Defaults ON (slot-change flow).
  const [issueTokens, setIssueTokens] = useState(true)

  function handleSave() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const r = await updateSubscription({
        subscriptionId:      s.id,
        billedToId,
        subscriptionType:    subType,
        subscriptionPrice:   price,
        defaultHorseId:      horseId || null,
        isProrated,
        proratedPrice:       isProrated && typeof proratedPrice === 'number' ? proratedPrice : null,
        proratedLessonCount: isProrated && typeof proratedCount === 'number' ? proratedCount : null,
        status,
        cascadeDefaultHorse: cascadeHorse,
      })
      if (r?.error) { setError(r.error); return }
      setNotice('Saved.')
      router.refresh()
    })
  }

  function handleCancelRemaining() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const r = await cancelRemainingLessons({
        subscriptionId: s.id,
        reason:         cancelReason || 'Subscription slot change',
        grantTokens:    issueTokens,
      })
      if (r?.error) { setError(r.error); return }
      setConfirming(false)
      setNotice(
        issueTokens
          ? `Cancelled ${r.cancelledCount} lesson${r.cancelledCount === 1 ? '' : 's'} · `
            + `issued ${r.tokensIssued} token${r.tokensIssued === 1 ? '' : 's'}.`
          : `Cancelled ${r.cancelledCount} lesson${r.cancelledCount === 1 ? '' : 's'} · no tokens issued.`,
      )
      router.refresh()
    })
  }

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  return (
    <div>
      {/* Header / locked fields */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-xs font-bold text-[#191c1e] uppercase tracking-wide mb-2">Slot (locked)</h3>
        <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-xs">
          <dt className="text-[#444650] font-semibold">Rider</dt>
          <dd className="text-[#191c1e]">{s.rider_name}</dd>
          <dt className="text-[#444650] font-semibold">Instructor</dt>
          <dd className="text-[#191c1e]">{s.instructor_name}</dd>
          <dt className="text-[#444650] font-semibold">Quarter</dt>
          <dd className="text-[#191c1e]">{s.quarter_label}</dd>
          <dt className="text-[#444650] font-semibold">Slot</dt>
          <dd className="text-[#191c1e]">{DAY_LABEL[s.lesson_day]} {formatTime(s.lesson_time)}</dd>
        </dl>
        <p className="text-[10px] text-[#444650] mt-2 leading-relaxed">
          To change the day, time, or instructor, cancel the remaining lessons below — that issues one makeup token per cancelled lesson. Reschedule the tokens at the new slot from the <Link href="/chia/lessons-events/tokens" className="text-[#002058] font-semibold hover:underline">Tokens page</Link>.
        </p>
      </div>

      {/* Editable metadata */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-xs font-bold text-[#191c1e] uppercase tracking-wide mb-3">Editable</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label className={labelCls}>Billed to</label>
            <SearchPicker
              name="_picker_billed_to"
              placeholder="Type to search…"
              options={billers.map(p => ({ id: p.id, label: p.name }))}
              initialValue={
                billedToId
                  ? { id: billedToId, label: billers.find(b => b.id === billedToId)?.name ?? '' }
                  : null
              }
              onSelect={opt => setBilledToId(opt?.id ?? '')}
            />
          </div>

          <div>
            <label className={labelCls}>Default horse</label>
            <SearchPicker
              name="_picker_horse"
              placeholder="Type to search horses…"
              options={horses.map(h => ({ id: h.id, label: h.name }))}
              initialValue={
                horseId
                  ? { id: horseId, label: horses.find(h => h.id === horseId)?.name ?? s.default_horse_name ?? '' }
                  : null
              }
              onSelect={opt => setHorseId(opt?.id ?? '')}
            />
            <label className="flex items-center gap-1.5 mt-1 text-[10px] text-[#444650] cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeHorse}
                onChange={e => setCascadeHorse(e.target.checked)}
                className="accent-[#002058]"
              />
              Apply to future lessons that still use the old default
            </label>
          </div>

          <div>
            <label className={labelCls}>Subscription type</label>
            <div className="flex gap-2">
              {(['standard', 'boarder'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSubType(t)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded border transition-colors capitalize ${
                    subType === t
                      ? 'bg-[#002058] text-white border-[#002058]'
                      : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#002058]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
              <option value="pending">Pending (unpaid)</option>
              <option value="active">Active (paid)</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Full quarter price ($)</label>
            <input
              type="number"
              min={0}
              step={1}
              className={inputCls}
              value={price}
              onChange={e => setPrice(Number(e.target.value))}
            />
          </div>

          <div>
            <label className={labelCls}>
              <span className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isProrated}
                  onChange={e => setIsProrated(e.target.checked)}
                  className="accent-[#002058]"
                />
                Prorated
              </span>
            </label>
            {isProrated && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputCls}
                  placeholder="Price"
                  value={proratedPrice}
                  onChange={e => setProratedPrice(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputCls}
                  placeholder="# lessons"
                  value={proratedCount}
                  onChange={e => setProratedCount(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notices */}
      {error  && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
      {notice && <div className="mb-3 px-3 py-2 bg-[#e8f4ea] border border-[#b7f0d0] rounded text-xs text-[#1a6b3c]">{notice}</div>}

      {/* Save / cancel */}
      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Link
          href="/chia/lessons-events/subscriptions"
          className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
        >
          Back
        </Link>
      </div>

      {/* Danger zone: batch cancel remaining */}
      <div className="bg-[#fff8f8] rounded-lg border border-[#ffd6d6] p-4">
        <h3 className="text-xs font-bold text-[#8a1a1a] uppercase tracking-wide mb-1">Cancel remaining lessons</h3>
        <p className="text-xs text-[#444650] mb-3 leading-relaxed">
          Barn-cancels every future scheduled lesson on this subscription
          {futureLessonCount > 0 ? ` (${futureLessonCount} lesson${futureLessonCount === 1 ? '' : 's'})` : ''}
          {' '}and issues one makeup token per cancelled lesson. Semi-private / group lessons with other riders stay on the schedule for them — the lesson type downgrades automatically. Past lessons are untouched.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending || futureLessonCount === 0}
            className="bg-[#8a1a1a] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#a82020] disabled:opacity-50 transition-colors"
          >
            Cancel {futureLessonCount} remaining lesson{futureLessonCount === 1 ? '' : 's'}
          </button>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wide mb-1">
                Reason (optional, recorded on each lesson)
              </label>
              <input
                className={inputCls}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g., Moving to Thu 3pm"
                autoFocus
              />
            </div>
            <label className="flex items-start gap-1.5 text-[11px] text-[#191c1e] cursor-pointer">
              <input
                type="checkbox"
                checked={issueTokens}
                onChange={e => setIssueTokens(e.target.checked)}
                className="accent-[#002058] mt-0.5"
              />
              <span>
                Issue makeup tokens
                <span className="text-[#444650]"> — uncheck for riders who never paid or were refunded.</span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelRemaining}
                disabled={pending}
                className="bg-[#8a1a1a] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#a82020] disabled:opacity-50 transition-colors"
              >
                {pending ? 'Cancelling…' : `Confirm cancel ${futureLessonCount} lesson${futureLessonCount === 1 ? '' : 's'}${issueTokens ? '' : ' (no tokens)'}`}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
              >
                Back out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
