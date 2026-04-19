'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchPicker from '@/components/SearchPicker'
import { createEvent } from '../actions'

type Option = { id: string; name: string }

type EventTypeOption = {
  code:             string
  label:            string
  defaultDuration:  number
  calendarColor:    string | null
  calendarBadge:    string | null
}

type Props = {
  eventTypes:     EventTypeOption[]
  hosts:          Option[]
  instructors:    Option[]
  suggestedDate?: string
  suggestedTime?: string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function NewEventForm({
  eventTypes, hosts, instructors, suggestedDate, suggestedTime,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const defaultType = eventTypes[0]
  const [typeCode, setTypeCode]       = useState<string>(defaultType?.code ?? '')
  const [duration, setDuration]       = useState<string>(String(defaultType?.defaultDuration ?? 60))
  const [hostId, setHostId]           = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [title, setTitle]             = useState('')
  const [date, setDate]               = useState(suggestedDate ?? todayIso())
  const [time, setTime]               = useState(suggestedTime ?? '16:00')
  const [price, setPrice]             = useState('')
  const [partySize, setPartySize]     = useState('')
  const [notes, setNotes]             = useState('')

  const selectedType = eventTypes.find(t => t.code === typeCode)
  const isBirthday = typeCode === 'birthday_party'

  function handleTypeChange(newCode: string) {
    setTypeCode(newCode)
    // Pre-fill duration from the catalog default whenever the type changes —
    // admin can still override afterward. No-op if the admin hasn't touched
    // duration explicitly is too clever; simpler to always reset and let them
    // re-type the override if they want one.
    const t = eventTypes.find(x => x.code === newCode)
    if (t) setDuration(String(t.defaultDuration))
  }

  function canSubmit(): string | null {
    if (!typeCode)        return 'Pick an event type.'
    if (!title.trim())    return 'Title is required.'
    if (!hostId)          return 'Select a host.'
    if (!date || !time)   return 'Set a date and time.'
    const parsedDuration = Number(duration)
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) return 'Duration must be a positive number of minutes.'
    const parsedPrice = Number(price)
    if (price === '' || !Number.isFinite(parsedPrice)) return 'Price is required.'
    if (parsedPrice <= 0) return 'Price must be greater than $0.'
    if (partySize !== '') {
      const p = Number(partySize)
      if (!Number.isFinite(p) || p <= 0) return 'Party size must be a positive number or blank.'
    }
    return null
  }

  function handleSubmit() {
    const err = canSubmit()
    if (err) { setError(err); return }
    setError(null)

    startTransition(async () => {
      const result = await createEvent({
        eventTypeCode:   typeCode,
        scheduledAt:     `${date}T${time}:00`,
        durationMinutes: Number(duration),
        hostId,
        instructorId:    instructorId || null,
        title:           title.trim(),
        price:           Number(price),
        partySize:       partySize === '' ? null : Number(partySize),
        notes:           notes.trim() || null,
      })

      if (result?.error) {
        setError(result.error)
        return
      }

      router.push('/chia/lessons-events')
    })
  }

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  return (
    <div>
      {/* Event type */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <label className={labelCls}>Event type</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {eventTypes.map(t => (
            <button
              key={t.code}
              type="button"
              onClick={() => handleTypeChange(t.code)}
              className={`text-xs font-semibold py-2 px-2 rounded border transition-colors text-center ${
                typeCode === t.code
                  ? 'bg-[#002058] text-white border-[#002058]'
                  : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#002058]'
              }`}
            >
              {t.label}
              <div className="text-[10px] font-normal opacity-80 mt-0.5">
                {t.defaultDuration} min default
              </div>
            </button>
          ))}
        </div>
        {selectedType?.calendarBadge && (
          <p className="text-[10px] text-[#444650] mt-2">
            Shows on calendar with the{' '}
            <span
              className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white align-middle"
              style={{ backgroundColor: selectedType.calendarColor ?? '#8c8e98' }}
            >
              {selectedType.calendarBadge}
            </span>{' '}
            badge.
          </p>
        )}
      </div>

      {/* Main form */}
      <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Title — full width */}
          <div className="col-span-2">
            <label className={labelCls}>Title</label>
            <input
              type="text"
              className={inputCls}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={isBirthday ? "e.g. Sophie's 8th Birthday" : 'e.g. Jumping Clinic with Sarah Miller'}
            />
          </div>

          {/* Host */}
          <div>
            <label className={labelCls}>Host (billed to)</label>
            <SearchPicker
              name="_picker_host"
              placeholder="Type to search people…"
              options={hosts.map(h => ({ id: h.id, label: h.name }))}
              onSelect={opt => setHostId(opt?.id ?? '')}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-[#444650]">
                The one person billed for this event.
              </p>
              <Link
                href="/chia/people/invite?returnTo=%2Fchia%2Flessons-events%2Fevents%2Fnew&returnLabel=New+Event"
                className="text-[10px] text-[#002058] font-semibold hover:underline"
                title="Creates a stub Person + waiver invite link, then brings you right back here"
              >
                + Invite rider
              </Link>
            </div>
          </div>

          {/* Instructor (optional) */}
          <div>
            <label className={labelCls}>Instructor (optional)</label>
            <SearchPicker
              name="_picker_instructor"
              placeholder="Type to search instructors…"
              options={instructors.map(i => ({ id: i.id, label: i.name }))}
              onSelect={opt => setInstructorId(opt?.id ?? '')}
            />
            <p className="text-[10px] text-[#444650] mt-1">
              Leave blank for external clinicians, therapists, etc.
            </p>
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Time */}
          <div>
            <label className={labelCls}>Time</label>
            <input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} />
          </div>

          {/* Duration */}
          <div>
            <label className={labelCls}>Duration (minutes)</label>
            <input
              type="number"
              min={1}
              step={5}
              className={inputCls}
              value={duration}
              onChange={e => setDuration(e.target.value)}
            />
          </div>

          {/* Price */}
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

          {/* Party size — only for birthdays, but allowed on any type */}
          <div className="col-span-2">
            <label className={labelCls}>
              Party size {isBirthday ? '' : '(optional)'}
            </label>
            <input
              type="number"
              min={1}
              step={1}
              className={inputCls}
              value={partySize}
              onChange={e => setPartySize(e.target.value)}
              placeholder={isBirthday ? 'e.g. 10' : 'Leave blank if not applicable'}
            />
          </div>

          {/* Notes */}
          <div className="col-span-2">
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              rows={2}
              className={inputCls}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything the barn needs to know…"
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
          {pending ? 'Creating…' : `Create ${selectedType?.label ?? 'Event'}`}
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
