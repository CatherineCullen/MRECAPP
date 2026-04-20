'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchPicker from '@/components/SearchPicker'
import { createSubscription } from '../actions'
import { sendPackageInvoice } from '../../../unbilled/actions'
import { generateLessonDates, DAYS, type DayOfWeek, type CalendarDay } from '../../../_lib/generateLessonDates'

type Option         = { id: string; name: string }
type RiderOption    = Option & { defaultBilledToId: string }
type Quarter = {
  id:         string
  label:      string
  start_date: string
  end_date:   string
  is_active:  boolean
}

type Props = {
  riders:         RiderOption[]
  billers:        Option[]
  instructors:    Option[]
  horses:         Option[]
  quarters:       Quarter[]
  daysByQuarter:  Record<string, CalendarDay[]>
  prefillQuarterId?: string
  prefillStartDate?: string
  prefillTime?:      string
  prefillDay?:       DayOfWeek
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
}

const DEFAULT_PRICE = 900 // placeholder starting value — admin overrides

function fmtDateShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function NewSubscriptionForm({
  riders, billers, instructors, horses, quarters, daysByQuarter,
  prefillQuarterId, prefillStartDate, prefillTime, prefillDay,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [invoicePending, startInvoiceTransition] = useTransition()
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ subscriptionId: string; billedToId: string } | null>(null)

  // Default quarter: prefilled (from calendar click), else active, else first upcoming
  const initialQuarter =
    (prefillQuarterId && quarters.find(q => q.id === prefillQuarterId)) ||
    quarters.find(q => q.is_active) ||
    quarters[0]

  // Form state
  const [riderId, setRiderId]           = useState('')
  const [billedToId, setBilledToId]     = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [quarterId, setQuarterId]       = useState(initialQuarter?.id ?? '')
  const [dayOfWeek, setDayOfWeek]       = useState<DayOfWeek>(prefillDay ?? 'tuesday')
  const [lessonTime, setLessonTime]     = useState(prefillTime ?? '16:00')
  const [horseId, setHorseId]           = useState('')
  const [subType, setSubType]           = useState<'standard' | 'boarder'>('standard')
  const [price, setPrice]               = useState<number>(DEFAULT_PRICE)
  const [startDate, setStartDate]       = useState<string>(prefillStartDate ?? initialQuarter?.start_date ?? '')
  const [excluded, setExcluded]         = useState<Set<string>>(new Set())

  // When the rider changes, autofill billed-to: adults bill themselves;
  // minors bill their guardian. Admin can override after the autofill.
  function handleRiderChange(v: string) {
    setRiderId(v)
    if (!v) return
    const rider = riders.find(r => r.id === v)
    setBilledToId(rider?.defaultBilledToId ?? v)
  }

  // When quarter changes, reset startDate to the new quarter start
  function handleQuarterChange(v: string) {
    setQuarterId(v)
    const q = quarters.find(x => x.id === v)
    if (q) setStartDate(q.start_date)
    setExcluded(new Set())
  }

  const selectedQuarter = quarters.find(q => q.id === quarterId)
  const calendarDays    = daysByQuarter[quarterId] ?? []

  // Compute proposed lesson dates (memoized — recomputes on any relevant field change)
  const proposedDates = useMemo(() => {
    if (!selectedQuarter || !startDate) return []
    return generateLessonDates({
      dayOfWeek,
      startDate,
      endDate:      selectedQuarter.end_date,
      calendarDays,
    })
  }, [selectedQuarter, startDate, dayOfWeek, calendarDays])

  const kept = proposedDates.filter(d => !excluded.has(d))

  const isProrated   = Boolean(selectedQuarter && startDate > selectedQuarter.start_date)
  const suggestedProratedPrice = isProrated && price > 0
    ? Math.round((price / 12) * kept.length)
    : null

  function toggleExcluded(date: string) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function canSubmit(): string | null {
    if (!riderId)      return 'Select a rider.'
    if (!billedToId)   return 'Select who the invoice is billed to.'
    if (!instructorId) return 'Select an instructor.'
    if (!quarterId)    return 'Select a quarter.'
    if (!lessonTime)   return 'Set a lesson time.'
    if (price <= 0)    return 'Price must be greater than zero.'
    if (kept.length === 0) return 'No lesson dates would be generated — check the quarter and day of week.'
    return null
  }

  function handleSubmit() {
    const err = canSubmit()
    if (err) { setError(err); return }
    setError(null)

    startTransition(async () => {
      try {
        const result = await createSubscription({
          riderId,
          billedToId,
          instructorId,
          quarterId,
          dayOfWeek,
          lessonTime,
          defaultHorseId:       horseId || null,
          subscriptionType:     subType,
          subscriptionPrice:    price,
          startDate,
          lessonDates:          kept,
          isProrated,
          proratedPrice:        suggestedProratedPrice,
        })
        if (result?.error) {
          setError(result.error)
          return
        }
        if (result.subscriptionId) {
          setCreated({ subscriptionId: result.subscriptionId, billedToId })
        }
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong.')
      }
    })
  }

  function handleSendNow() {
    if (!created) return
    setInvoiceError(null)
    startInvoiceTransition(async () => {
      const result = await sendPackageInvoice({
        billedToId: created.billedToId,
        packageIds: [],
        subscriptionIds: [created.subscriptionId],
      })
      if (result.error) {
        setInvoiceError(result.error)
        return
      }
      router.push('/chia/lessons-events')
    })
  }

  // ------------- Rendering helpers -------------

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  if (created) {
    const billerName = billers.find(b => b.id === created.billedToId)?.name ?? 'the billed contact'
    return (
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-6 max-w-md">
        <p className="text-sm font-semibold text-[#191c1e] mb-1">Subscription created</p>
        <p className="text-xs text-[#444650] mb-5">Invoice {billerName}?</p>
        {invoiceError && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {invoiceError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSendNow}
            disabled={invoicePending}
            className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
          >
            {invoicePending ? 'Sending…' : 'Send Invoice Now'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/chia/lessons-events')}
            disabled={invoicePending}
            className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
          >
            Hold for Later
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
              options={riders.map(r => ({ id: r.id, label: r.name }))}
              onSelect={opt => handleRiderChange(opt?.id ?? '')}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-[#444650]">
                Any person. Rider role is auto-assigned.
              </p>
              <Link
                href="/chia/people/invite?returnTo=%2Fchia%2Flessons-events%2Fsubscriptions%2Fnew&returnLabel=New+Subscription"
                className="text-[10px] text-[#002058] font-semibold hover:underline"
                title="Creates a stub Person + waiver invite link, then brings you right back here"
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

          <div>
            <label className={labelCls}>Instructor</label>
            <SearchPicker
              name="_picker_instructor"
              placeholder="Type to search instructors…"
              options={instructors.map(i => ({ id: i.id, label: i.name }))}
              onSelect={opt => setInstructorId(opt?.id ?? '')}
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
              options={horses.map(h => ({ id: h.id, label: h.name }))}
              onSelect={opt => setHorseId(opt?.id ?? '')}
            />
          </div>

          <div>
            <label className={labelCls}>Quarter</label>
            <select className={inputCls} value={quarterId} onChange={e => handleQuarterChange(e.target.value)}>
              {quarters.map(q => (
                <option key={q.id} value={q.id}>{q.label}{q.is_active ? ' (active)' : ''}</option>
              ))}
            </select>
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
            <label className={labelCls}>Day of week</label>
            <select className={inputCls} value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value as DayOfWeek)}>
              {DAYS.map(d => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Lesson time</label>
            <input type="time" className={inputCls} value={lessonTime} onChange={e => setLessonTime(e.target.value)} />
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
            <label className={labelCls}>Starts on</label>
            <input
              type="date"
              className={inputCls}
              value={startDate}
              min={selectedQuarter?.start_date}
              max={selectedQuarter?.end_date}
              onChange={e => setStartDate(e.target.value)}
            />
            {isProrated && (
              <p className="text-[10px] text-[#7a5a00] mt-1">Mid-quarter enrollment — will be prorated.</p>
            )}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-bold text-[#191c1e]">Proposed Lesson Dates</h3>
          <div className="text-xs text-[#444650]">
            {kept.length} of {proposedDates.length} dates selected
            {kept.length >= 12 && <span className="text-[#7a5a00] ml-2">capped at 12</span>}
          </div>
        </div>

        {proposedDates.length === 0 ? (
          <p className="text-xs text-[#444650] py-4">
            No lessons would be generated with these settings. Try changing the day of week or start date.
          </p>
        ) : (
          <>
            <p className="text-[10px] text-[#444650] mb-2">
              Uncheck any date to skip it (e.g., family trip, known conflict). Closures and makeup days are already excluded.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {proposedDates.map(date => {
                const on = !excluded.has(date)
                return (
                  <label
                    key={date}
                    className={`flex items-center gap-2 px-2 py-1 rounded border text-xs cursor-pointer transition-colors ${
                      on
                        ? 'bg-[#f7f9fc] border-[#c4c6d1] text-[#191c1e]'
                        : 'bg-white border-[#c4c6d1]/40 text-[#c4c6d1] line-through'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleExcluded(date)}
                      className="accent-[#002058]"
                    />
                    {fmtDateShort(date)}
                  </label>
                )
              })}
            </div>
          </>
        )}

        {isProrated && kept.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#c4c6d1]/30 text-xs text-[#444650]">
            Suggested prorated price:{' '}
            <span className="font-semibold text-[#191c1e]">
              ${suggestedProratedPrice} ({kept.length} lessons × ${Math.round(price / 12)})
            </span>
          </div>
        )}
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
          disabled={pending}
          className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Creating…' : `Create Subscription${kept.length > 0 ? ` (${kept.length} lessons)` : ''}`}
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
