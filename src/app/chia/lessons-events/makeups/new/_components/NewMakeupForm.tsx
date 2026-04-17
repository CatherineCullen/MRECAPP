'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchPicker from '@/components/SearchPicker'
import { createLessonProduct } from '../../../products/new/actions'

export type TokenOption = {
  id:           string
  expiresAt:    string       // ISO date
  originDate:   string | null
  quarterLabel: string
}

export type RiderWithTokens = {
  riderId:   string
  riderName: string
  tokens:    TokenOption[]
}

type Option         = { id: string; name: string }
type HorseOption    = Option & { lessonHorse: boolean }

type Props = {
  riders:        RiderWithTokens[]
  instructors:   Option[]
  horses:        HorseOption[]
  prefillDate?:  string
  prefillTime?:  string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NewMakeupForm({ riders, instructors, horses, prefillDate, prefillTime }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [date, setDate]                 = useState(prefillDate ?? todayIso())
  const [time, setTime]                 = useState(prefillTime ?? '16:00')
  const [riderId, setRiderId]           = useState('')
  const [tokenId, setTokenId]           = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [horseId, setHorseId]           = useState('')
  const [notes, setNotes]               = useState('')

  const selectedRider = useMemo(
    () => riders.find(r => r.riderId === riderId) ?? null,
    [riders, riderId],
  )

  function handleRiderChange(v: string) {
    setRiderId(v)
    // Auto-pick earliest-expiring token when rider changes
    const r = riders.find(rr => rr.riderId === v)
    const first = r?.tokens[0]?.id ?? ''
    setTokenId(first)
  }

  function canSubmit(): string | null {
    if (!date)         return 'Pick a date.'
    if (!time)         return 'Pick a time.'
    if (!riderId)      return 'Pick a rider.'
    if (!tokenId)      return 'Pick a makeup token.'
    if (!instructorId) return 'Pick an instructor.'
    return null
  }

  function handleSubmit() {
    const err = canSubmit()
    if (err) { setError(err); return }
    setError(null)

    startTransition(async () => {
      try {
        const result = await createLessonProduct({
          kind:         'makeup',
          tokenId,
          riderId,
          instructorId,
          horseId:      horseId || null,
          scheduledAt:  `${date}T${time}:00`,
          lessonType:   'private',
          price:        0,          // ignored for makeup
          partySize:    null,
          notes:        notes || null,
        })
        if (result?.error) { setError(result.error); return }
        router.push('/chia/lessons-events')
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong.')
      }
    })
  }

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  // Group lesson horses first in the picker — matches the per-lesson horse picker convention
  const horseOptions = [
    ...horses.filter(h => h.lessonHorse),
    ...horses.filter(h => !h.lessonHorse),
  ].map(h => ({ id: h.id, label: h.lessonHorse ? h.name : `${h.name} (non-lesson)` }))

  return (
    <div>
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Time</label>
            <input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} />
          </div>

          <div className="col-span-2">
            <label className={labelCls}>
              Rider <span className="text-[10px] text-[#444650] font-normal">({riders.length} with available tokens)</span>
            </label>
            <SearchPicker
              name="_picker_rider"
              placeholder="Type to search riders with tokens…"
              options={riders.map(r => ({
                id:    r.riderId,
                label: `${r.riderName} · ${r.tokens.length} token${r.tokens.length === 1 ? '' : 's'}`,
              }))}
              onSelect={opt => handleRiderChange(opt?.id ?? '')}
            />
          </div>

          {selectedRider && (
            <div className="col-span-2">
              <label className={labelCls}>Token to redeem</label>
              <div className="space-y-1">
                {selectedRider.tokens.map(t => (
                  <label
                    key={t.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                      tokenId === t.id
                        ? 'bg-[#dae2ff]/40 border-[#002058]'
                        : 'bg-white border-[#c4c6d1] hover:border-[#002058]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="token"
                      checked={tokenId === t.id}
                      onChange={() => setTokenId(t.id)}
                      className="accent-[#002058]"
                    />
                    <span className="flex-1 text-[#191c1e]">
                      From lesson on <span className="font-semibold">{fmtDate(t.originDate)}</span>
                      <span className="text-[#444650] ml-1">· {t.quarterLabel}</span>
                    </span>
                    <span className="text-[10px] text-[#444650]">
                      expires {fmtDate(t.expiresAt)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Instructor</label>
            <SearchPicker
              name="_picker_instructor"
              placeholder="Type to search instructors…"
              options={instructors.map(i => ({ id: i.id, label: i.name }))}
              onSelect={opt => setInstructorId(opt?.id ?? '')}
            />
          </div>

          <div>
            <label className={labelCls}>Horse (optional)</label>
            <SearchPicker
              name="_picker_horse"
              placeholder="Type to search horses…"
              options={horseOptions}
              onSelect={opt => setHorseId(opt?.id ?? '')}
            />
          </div>

          <div className="col-span-2">
            <label className={labelCls}>Notes (optional)</label>
            <input
              className={inputCls}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., rescheduling from rainout"
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
          {pending ? 'Scheduling…' : 'Schedule Makeup'}
        </button>
        <Link
          href="/chia/lessons-events"
          className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
