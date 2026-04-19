'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchPicker from '@/components/SearchPicker'
import { createLessonProduct, type ProductKind } from '../actions'

type Option      = { id: string; name: string }
type RiderOption = Option & { defaultBilledToId: string }

type MakeupContext = {
  tokenId:            string
  riderId:            string
  riderName:          string
  reason:             'rider_cancel' | 'barn_cancel' | 'admin_grant'
  originalLessonDate: string | null      // ISO date
  quarterLabel:       string
  officialExpiresAt:  string              // ISO date
}

type Props = {
  riders:      RiderOption[]
  billers:     Option[]
  instructors: Option[]
  horses:      Option[]
  makeup?:     MakeupContext              // when present, lock to makeup flow
  suggestedDate?: string                  // YYYY-MM-DD default for date picker
  suggestedTime?: string                  // HH:MM default for time input (from calendar click)
  makeupDays?: string[]                   // ISO dates flagged as makeup days (guidance hint)
}

// Birthday parties, clinics, equine therapy, and other non-lesson-shaped
// products live in the separate Event entity — see /chia/lessons-events/events.
// This form only handles products that ARE lessons (evaluation, extra,
// makeup) so they inherit lesson_type (private/semi/group), makeup tokens,
// and cancellation semantics.
const KIND_OPTIONS: { value: Exclude<ProductKind, 'makeup'>; label: string; hint: string }[] = [
  { value: 'evaluation',   label: 'Evaluation',   hint: 'New rider intake lesson' },
  { value: 'extra_lesson', label: 'Extra Lesson', hint: 'Single add-on for an active rider' },
]

const LESSON_TYPE_OPTIONS: { value: 'private' | 'semi_private' | 'group'; label: string; duration: number }[] = [
  { value: 'private',      label: 'Private',      duration: 30 },
  { value: 'semi_private', label: 'Semi-Private', duration: 45 },
  { value: 'group',        label: 'Group',        duration: 60 },
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function NewLessonProductForm({
  riders, billers, instructors, horses, makeup, suggestedDate, suggestedTime, makeupDays,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isMakeup = Boolean(makeup)
  const makeupDaySet = new Set(makeupDays ?? [])

  // Form state
  const [kind, setKind] = useState<Exclude<ProductKind, 'makeup'>>('evaluation')
  const [riderId, setRiderId]           = useState(isMakeup ? makeup!.riderId : '')
  const [billedToId, setBilledToId]     = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [horseId, setHorseId]           = useState('')
  const [date, setDate]                 = useState<string>(suggestedDate ?? todayIso())
  const [time, setTime]                 = useState(suggestedTime ?? '16:00')
  const [lessonType, setLessonType]     = useState<'private' | 'semi_private' | 'group'>('private')
  // Price starts as empty string so the input is blank (not "0"), forcing
  // the admin to type a real number. Parsed at submit time.
  const [price, setPrice]               = useState<string>('')
  const [notes, setNotes]               = useState('')

  function handleRiderChange(v: string) {
    setRiderId(v)
    if (!v) return
    const rider = riders.find(r => r.id === v)
    setBilledToId(rider?.defaultBilledToId ?? v)
  }

  function canSubmit(): string | null {
    if (!riderId)      return 'Select a rider.'
    if (!instructorId) return 'Select an instructor.'
    if (!date || !time) return 'Set a date and time.'
    if (!isMakeup) {
      if (!billedToId)  return 'Select who the invoice is billed to.'
      const parsedPrice = Number(price)
      if (price === '' || !Number.isFinite(parsedPrice)) return 'Price is required.'
      if (parsedPrice < 0) return 'Price cannot be negative.'
    }
    return null
  }

  function handleSubmit() {
    const err = canSubmit()
    if (err) { setError(err); return }
    setError(null)

    startTransition(async () => {
      const result = await createLessonProduct({
        kind:         isMakeup ? 'makeup' : kind,
        tokenId:      makeup?.tokenId,
        riderId,
        billedToId:   isMakeup ? null : billedToId,
        instructorId,
        horseId:      horseId || null,
        scheduledAt:  `${date}T${time}:00`,
        lessonType,
        price:        isMakeup ? 0 : Number(price),
        partySize:    null,
        notes:        notes.trim() || null,
      })

      if (result?.error) {
        setError(result.error)
        return
      }

      // After makeup redemption, send the user back to the tokens page so they
      // see the token flip to 'scheduled'. After one-off, send them to the
      // new lesson's detail so they can add more riders or cancel if needed.
      if (isMakeup) {
        router.push('/chia/lessons-events/tokens')
      } else {
        router.push(result?.lessonId
          ? `/chia/lessons-events/${result.lessonId}`
          : '/chia/lessons-events')
      }
    })
  }

  // ---------- UI helpers ----------
  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  const REASON_LABEL: Record<MakeupContext['reason'], string> = {
    rider_cancel: 'Rider cancel',
    barn_cancel:  'Barn cancel',
    admin_grant:  'Admin grant',
  }

  return (
    <div>
      {/* Makeup context banner */}
      {isMakeup && makeup && (
        <div className="bg-[#dae2ff]/40 border border-[#002058]/30 rounded-lg px-4 py-3 mb-4">
          <div className="text-xs font-semibold text-[#002058] uppercase tracking-wide mb-1">
            Scheduling a Makeup Lesson
          </div>
          <div className="text-sm text-[#191c1e]">
            <span className="font-semibold">{makeup.riderName}</span>
            <span className="text-[#444650]"> · {makeup.quarterLabel}</span>
          </div>
          <div className="text-[11px] text-[#444650] mt-0.5">
            Source: {REASON_LABEL[makeup.reason]}
            {makeup.originalLessonDate && ` · Original lesson: ${new Date(makeup.originalLessonDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            {' · '}Token expires: {new Date(makeup.officialExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* Product type (non-makeup only) */}
      {!isMakeup && (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
          <label className={labelCls}>Product type</label>
          <div className="grid grid-cols-2 gap-2">
            {KIND_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={`text-xs font-semibold py-2 px-2 rounded border transition-colors text-center ${
                  kind === opt.value
                    ? 'bg-[#002058] text-white border-[#002058]'
                    : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#002058]'
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#444650] mt-2">
            {KIND_OPTIONS.find(o => o.value === kind)?.hint}
          </p>
        </div>
      )}

      {/* Main form */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Rider */}
          <div>
            <label className={labelCls}>Rider</label>
            {isMakeup ? (
              <div className="px-2 py-1.5 text-sm bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded text-[#191c1e]">
                {makeup!.riderName}
              </div>
            ) : (
              <>
                <SearchPicker
                  name="_picker_rider"
                  placeholder="Type to search people…"
                  options={riders.map(r => ({ id: r.id, label: r.name }))}
                  onSelect={opt => handleRiderChange(opt?.id ?? '')}
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-[#444650]">
                    Any person. Rider role is auto-assigned.
                  </p>
                  <Link
                    href="/chia/people/invite?returnTo=%2Fchia%2Flessons-events%2Fproducts%2Fnew&returnLabel=New+Lesson"
                    className="text-[10px] text-[#002058] font-semibold hover:underline"
                    title="Creates a stub Person + waiver invite link, then brings you right back here"
                  >
                    + Invite rider
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Billed to — non-makeup only */}
          {!isMakeup && (
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
                key={`billed-${billedToId}`}
              />
            </div>
          )}

          {/* Instructor */}
          <div>
            <label className={labelCls}>Instructor</label>
            <SearchPicker
              name="_picker_instructor"
              placeholder="Type to search instructors…"
              options={instructors.map(i => ({ id: i.id, label: i.name }))}
              onSelect={opt => setInstructorId(opt?.id ?? '')}
            />
          </div>

          {/* Horse */}
          <div>
            <label className={labelCls}>Horse (optional)</label>
            <SearchPicker
              name="_picker_horse"
              placeholder="Type to search horses…"
              options={horses.map(h => ({ id: h.id, label: h.name }))}
              onSelect={opt => setHorseId(opt?.id ?? '')}
            />
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>Date</label>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            {isMakeup && makeupDaySet.has(date) && (
              <p className="text-[10px] text-[#4a1a8c] mt-1 font-semibold">
                ✓ This is a scheduled makeup day.
              </p>
            )}
            {isMakeup && !makeupDaySet.has(date) && (
              <p className="text-[10px] text-[#444650] mt-1">
                Any date works. Barn makeup days are the default slots but not required.
              </p>
            )}
          </div>

          {/* Time */}
          <div>
            <label className={labelCls}>Time</label>
            <input
              type="time"
              className={inputCls}
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>

          {/* Lesson type */}
          <div className="col-span-2">
            <label className={labelCls}>Lesson type (sets duration)</label>
            <div className="grid grid-cols-3 gap-2">
              {LESSON_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLessonType(opt.value)}
                  className={`text-xs font-semibold py-1.5 rounded border transition-colors ${
                    lessonType === opt.value
                      ? 'bg-[#002058] text-white border-[#002058]'
                      : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#002058]'
                  }`}
                >
                  {opt.label} · {opt.duration}min
                </button>
              ))}
            </div>
          </div>

          {/* Price — non-makeup only, required */}
          {!isMakeup && (
            <div>
              <label className={labelCls}>Price ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                placeholder="0.00"
                className={inputCls}
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="col-span-2">
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              rows={2}
              className={inputCls}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything the instructor or barn needs to know…"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending
            ? (isMakeup ? 'Scheduling…' : 'Creating…')
            : (isMakeup ? 'Schedule Makeup' : `Create ${KIND_OPTIONS.find(o => o.value === kind)?.label}`)}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={pending}
          className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
