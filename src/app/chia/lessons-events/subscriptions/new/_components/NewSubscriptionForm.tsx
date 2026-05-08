'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchPicker from '@/components/SearchPicker'
import { createMonthlySubscription } from '../actions'
import {
  DAYS,
  type DayOfWeek,
  type CalendarDay,
  addMonths,
  monthOfIso,
  slotDatesInMonth,
  todayIso,
} from '@/lib/lessons/monthly/dates'

/**
 * New Subscription form — monthly model (ADR-0019).
 *
 * Asks for: rider, billed-to, instructor, default horse, subscription
 * type (Standard/Boarder), day of week, lesson time. That's it — no
 * quarter, no manual price (uses catalog), no manual lesson-date
 * exclusion (calendar dictates).
 *
 * Live preview: shows the 3-month rolling window (prorated current +
 * 2 full future months) with computed dates and totals. Updates as
 * admin changes any input.
 */

type Option         = { id: string; name: string }
type RiderOption    = Option & { defaultBilledToId: string }

type Props = {
  riders:                 RiderOption[]
  billers:                Option[]
  instructors:            Option[]
  horses:                 Option[]
  /** Barn calendar days from today through end of month+2. */
  calendarDays:           CalendarDay[]
  /** Catalog rate for Standard riders, or null if admin hasn't set it. */
  perLessonPriceStandard: number | null
  /** Catalog rate for Boarder riders, or null if admin hasn't set it. */
  perLessonPriceBoarder:  number | null
  prefillTime?:           string
  prefillDay?:            DayOfWeek
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
}

const MONTH_LABEL = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function NewSubscriptionForm({
  riders, billers, instructors, horses, calendarDays,
  perLessonPriceStandard, perLessonPriceBoarder,
  prefillTime, prefillDay,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{
    subscriptionId: string
    riderName:      string
  } | null>(null)

  // Form state
  const [riderId, setRiderId]           = useState('')
  const [billedToId, setBilledToId]     = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [dayOfWeek, setDayOfWeek]       = useState<DayOfWeek>(prefillDay ?? 'tuesday')
  const [lessonTime, setLessonTime]     = useState(prefillTime ?? '16:00')
  const [horseId, setHorseId]           = useState('')
  const [subType, setSubType]           = useState<'standard' | 'boarder'>('standard')

  // When the rider changes, autofill billed-to (adults bill themselves;
  // minors bill their guardian). Admin can override after the autofill.
  function handleRiderChange(v: string) {
    setRiderId(v)
    if (!v) return
    const rider = riders.find((r) => r.id === v)
    setBilledToId(rider?.defaultBilledToId ?? v)
  }

  const perLessonPrice = subType === 'standard' ? perLessonPriceStandard : perLessonPriceBoarder
  const rateMissing    = perLessonPrice == null

  // Compute the 3-month preview client-side from the calendar days the
  // page loaded. Mirrors what `generateInitialMonths` does on the server
  // so the preview matches the actual rows that get created.
  const preview = useMemo(() => {
    const today          = todayIso()
    const { year, month } = monthOfIso(today)

    const windows = [0, 1, 2].map((offset) => {
      const ym         = addMonths(year, month, offset)
      const isProrated = offset === 0
      const dates = slotDatesInMonth({
        dayOfWeek,
        year:         ym.year,
        month:        ym.month,
        calendarDays,
        fromDate:     isProrated ? today : undefined,
      })
      return {
        year:        ym.year,
        month:       ym.month,
        isProrated,
        dates,
        lessonCount: dates.length,
        total:       perLessonPrice != null ? perLessonPrice * dates.length : null,
      }
    })

    return windows
  }, [dayOfWeek, calendarDays, perLessonPrice])

  function canSubmit(): string | null {
    if (!riderId)      return 'Select a rider.'
    if (!billedToId)   return 'Select who the invoice is billed to.'
    if (!instructorId) return 'Select an instructor.'
    if (!lessonTime)   return 'Set a lesson time.'
    if (rateMissing) {
      return `Per-lesson rate for ${subType} riders is not set. Configure it in Configuration → Catalog first.`
    }
    return null
  }

  function handleSubmit() {
    const err = canSubmit()
    if (err) { setError(err); return }
    setError(null)

    startTransition(async () => {
      try {
        const result = await createMonthlySubscription({
          riderId,
          billedToId,
          instructorId,
          dayOfWeek,
          lessonTime,
          defaultHorseId:    horseId || null,
          subscriptionType:  subType,
        })
        if (result.error) {
          setError(result.error)
          return
        }
        if (result.subscriptionId) {
          const riderName = riders.find((r) => r.id === riderId)?.name ?? 'Rider'
          setCreated({ subscriptionId: result.subscriptionId, riderName })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  // ---------- Rendering ----------

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  if (created) {
    return (
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-6 max-w-md">
        <p className="text-sm font-semibold text-[#191c1e] mb-1">Subscription created for {created.riderName}</p>
        <p className="text-xs text-[#444650] mb-5">
          The 3-month rolling window has been generated. Send the first invoice from the Monthly Subscriptions tab when you&apos;re ready, or hold for the next batch.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/chia/lessons-events')}
            className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] transition-colors"
          >
            Back to Lessons & Events
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Form grid */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label className={labelCls}>Rider</label>
            <SearchPicker
              name="_picker_rider"
              placeholder="Type to search people…"
              options={riders.map((r) => ({ id: r.id, label: r.name }))}
              onSelect={(opt) => handleRiderChange(opt?.id ?? '')}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-[#444650]">
                Any person. Rider role is auto-assigned.
              </p>
              <Link
                href="/chia/people/invite?returnTo=%2Fchia%2Flessons-events%2Fsubscriptions%2Fnew&returnLabel=New+Subscription"
                className="text-[10px] text-[#002058] font-semibold hover:underline"
              >
                + Invite rider
              </Link>
            </div>
          </div>

          <div>
            <label className={labelCls}>Billed to</label>
            <SearchPicker
              name="_picker_billed_to"
              placeholder="Type to search…"
              options={billers.map((p) => ({ id: p.id, label: p.name }))}
              initialValue={
                billedToId
                  ? { id: billedToId, label: billers.find((b) => b.id === billedToId)?.name ?? '' }
                  : null
              }
              onSelect={(opt) => setBilledToId(opt?.id ?? '')}
              key={`billed-${billedToId}`}
            />
          </div>

          <div>
            <label className={labelCls}>Instructor</label>
            <SearchPicker
              name="_picker_instructor"
              placeholder="Type to search instructors…"
              options={instructors.map((i) => ({ id: i.id, label: i.name }))}
              onSelect={(opt) => setInstructorId(opt?.id ?? '')}
            />
            {instructors.length === 0 && (
              <p className="text-[10px] text-[#7a5a00] mt-1">No instructors yet. Add them in People.</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Default horse (optional)</label>
            <SearchPicker
              name="_picker_horse"
              placeholder="Type to search horses…"
              options={horses.map((h) => ({ id: h.id, label: h.name }))}
              onSelect={(opt) => setHorseId(opt?.id ?? '')}
            />
          </div>

          <div>
            <label className={labelCls}>Subscription type</label>
            <div className="flex gap-2">
              {(['standard', 'boarder'] as const).map((t) => (
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
            <p className="text-[10px] text-[#444650] mt-1">
              {rateMissing
                ? <span className="text-[#7a5a00]">Rate not set — configure in <Link href="/chia/lessons-events/configuration/catalog" className="underline">Catalog</Link>.</span>
                : <>Rate: <span className="font-semibold text-[#191c1e]">{fmtMoney(perLessonPrice!)}</span> per lesson</>
              }
            </p>
          </div>

          <div>
            <label className={labelCls}>Day of week</label>
            <select className={inputCls} value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}>
              {DAYS.map((d) => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Lesson time</label>
            <input type="time" className={inputCls} value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 3-month preview */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <h3 className="text-sm font-bold text-[#191c1e] mb-2">Three-month preview</h3>
        <p className="text-[10px] text-[#444650] mb-3">
          The first month is prorated from today; the next two months stay pending until the monthly invoice batch sends.
        </p>
        <div className="space-y-2.5">
          {preview.map((m) => (
            <div key={`${m.year}-${m.month}`} className="border border-[#c4c6d1]/40 rounded p-2.5">
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-xs font-semibold text-[#191c1e]">
                  {MONTH_LABEL[m.month]} {m.year}
                  {m.isProrated && <span className="ml-2 text-[10px] font-normal text-[#7a5a00]">(prorated from today)</span>}
                </div>
                <div className="text-xs tabular-nums text-[#444650]">
                  {m.lessonCount} {m.lessonCount === 1 ? 'lesson' : 'lessons'}
                  {m.total != null && (
                    <span className="ml-2 font-semibold text-[#191c1e]">{fmtMoney(m.total)}</span>
                  )}
                </div>
              </div>
              {m.dates.length === 0 ? (
                <p className="text-[10px] text-[#444650]">No lessons in this month with these settings.</p>
              ) : (
                <p className="text-[11px] text-[#444650]">
                  {m.dates.map(fmtDateShort).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error + actions */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || rateMissing}
          className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Creating…' : 'Create Subscription'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/chia/lessons-events')}
          disabled={pending}
          className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
