'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSheet } from '../../actions'

export type ProviderServicePair = {
  providerPersonId: string
  providerName:     string
  serviceId:        string
  serviceName:      string
}

export default function NewSheetForm({ pairs }: { pairs: ProviderServicePair[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Distinct providers from the QR pair list. Service select is filtered down
  // when a provider is picked.
  const providers = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of pairs) map.set(p.providerPersonId, p.providerName)
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [pairs])

  const [providerId, setProviderId] = useState('')
  const [serviceId,  setServiceId]  = useState('')
  const [date,       setDate]       = useState('')
  const [mode,       setMode]       = useState<'timed' | 'ordered'>('timed')
  const [title,      setTitle]      = useState('')
  const [description, setDescription] = useState('')
  const [count,      setCount]      = useState(8)
  const [startTime,  setStartTime]  = useState('09:00')
  const [duration,   setDuration]   = useState(30)
  const [error, setError] = useState<string | null>(null)

  const servicesForProvider = pairs.filter(p => p.providerPersonId === providerId)

  function submit() {
    setError(null)
    if (!providerId || !serviceId) return setError('Pick a provider and service')
    if (!date) return setError('Pick a date')
    if (!title.trim()) return setError('Title is required')
    if (count < 1 || count > 50) return setError('Slot count must be 1–50')

    startTransition(async () => {
      const r = await createSheet({
        providerPersonId: providerId,
        serviceId,
        date,
        mode,
        title: title.trim(),
        description: description.trim() || null,
        count,
        startTime: mode === 'timed' ? startTime : undefined,
        durationMinutes: mode === 'timed' ? duration : undefined,
      })
      if (r.error) { setError(r.error); return }
      router.push(`/chia/boarding/sheets/${r.id}`)
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider">
          <select
            value={providerId}
            onChange={e => { setProviderId(e.target.value); setServiceId('') }}
            className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#002058]"
          >
            <option value="">— pick —</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Service">
          <select
            value={serviceId}
            onChange={e => setServiceId(e.target.value)}
            disabled={!providerId}
            className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#002058] disabled:bg-[#f2f4f7]"
          >
            <option value="">{providerId ? '— pick —' : '— pick provider first —'}</option>
            {servicesForProvider.map(s => (
              <option key={s.serviceId} value={s.serviceId}>{s.serviceName}</option>
            ))}
          </select>
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#002058]"
          />
        </Field>

        <Field label="Mode">
          <div className="flex gap-3 text-sm pt-1.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'timed'} onChange={() => setMode('timed')} />
              Timed
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'ordered'} onChange={() => setMode('ordered')} />
              Ordered (no times)
            </label>
          </div>
        </Field>
      </div>

      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Spring chiro day"
          className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058]"
        />
      </Field>

      <Field label="Description (shown at top of sheet — optional)">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Dr. Smith will be here Friday for chiro adjustments. $120/horse, billed monthly. Add a note if your horse has anything specific to flag."
          className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058]"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Number of slots">
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={e => setCount(parseInt(e.target.value, 10) || 0)}
            className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058]"
          />
        </Field>

        {mode === 'timed' && (
          <>
            <Field label="Start time">
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058]"
              />
            </Field>
            <Field label="Slot length (min)">
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value, 10) || 0)}
                className="w-full text-sm border border-[#c4c6d1] rounded px-2 py-1.5 focus:outline-none focus:border-[#002058]"
              />
            </Field>
          </>
        )}
      </div>

      {error && <div className="text-xs text-red-700">{error}</div>}

      <div className="flex items-center gap-2 pt-2 border-t border-[#e7e8ed]">
        <button
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 bg-[#002058] text-white text-sm font-semibold rounded hover:bg-[#001742] disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create sheet'}
        </button>
        <button
          onClick={() => router.push('/chia/boarding/sheets')}
          disabled={pending}
          className="text-sm text-[#444650] hover:text-[#191c1e]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
