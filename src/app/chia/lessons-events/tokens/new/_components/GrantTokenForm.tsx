'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { grantToken } from '../../actions'

type Props = {
  riders:      { id: string; name: string }[]
  subsByRider: Record<string, { id: string; label: string; quarter_id: string }[]>
  quarters:    { id: string; label: string; is_active: boolean }[]
}

export default function GrantTokenForm({ riders, subsByRider, quarters }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const defaultQuarter = quarters.find(q => q.is_active) ?? quarters[0]

  const [riderId, setRiderId]               = useState('')
  const [subscriptionId, setSubscriptionId] = useState<string>('')   // empty = no subscription link
  const [quarterId, setQuarterId]           = useState<string>(defaultQuarter?.id ?? '')
  const [note, setNote]                     = useState('')

  const riderSubs = useMemo(() => subsByRider[riderId] ?? [], [riderId, subsByRider])

  // When rider changes, clear subscription (may have been set to one that doesn't belong)
  function handleRiderChange(v: string) {
    setRiderId(v)
    setSubscriptionId('')
  }

  // When subscription is picked, default the quarter to its quarter (admin can override)
  function handleSubChange(v: string) {
    setSubscriptionId(v)
    if (v) {
      const sub = riderSubs.find(s => s.id === v)
      if (sub?.quarter_id) setQuarterId(sub.quarter_id)
    }
  }

  function handleSubmit() {
    setError(null)
    if (!riderId)   { setError('Select a rider.');   return }
    if (!quarterId) { setError('Select a quarter.'); return }

    startTransition(async () => {
      const r = await grantToken({
        riderId,
        subscriptionId: subscriptionId || null,
        quarterId,
        note,
      })
      if (r?.error) setError(r.error)
      else router.push('/chia/lessons-events/tokens')
    })
  }

  const labelCls = 'block text-xs font-semibold text-[#191c1e] mb-1'
  const inputCls = 'w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white'

  return (
    <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Rider</label>
          <select className={inputCls} value={riderId} onChange={e => handleRiderChange(e.target.value)}>
            <option value="">— Select rider —</option>
            {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {riders.length === 0 && (
            <p className="text-[10px] text-[#7a5a00] mt-1">No riders found. Add them in People first.</p>
          )}
        </div>

        <div>
          <label className={labelCls}>
            Link to subscription
            <span className="ml-1 text-[10px] font-normal text-[#444650]">(optional)</span>
          </label>
          <select
            className={inputCls}
            value={subscriptionId}
            onChange={e => handleSubChange(e.target.value)}
            disabled={!riderId}
          >
            <option value="">— No subscription link —</option>
            {riderSubs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {riderId && riderSubs.length === 0 && (
            <p className="text-[10px] text-[#444650] mt-1">This rider has no subscriptions. Token will not be linked.</p>
          )}
        </div>

        <div>
          <label className={labelCls}>Quarter</label>
          <select className={inputCls} value={quarterId} onChange={e => setQuarterId(e.target.value)}>
            <option value="">— Select quarter —</option>
            {quarters.map(q => (
              <option key={q.id} value={q.id}>{q.label}{q.is_active ? ' (active)' : ''}</option>
            ))}
          </select>
          <p className="text-[10px] text-[#444650] mt-1">Token expires at end of this quarter.</p>
        </div>

        <div>
          <label className={labelCls}>
            Reason / note
            <span className="ml-1 text-[10px] font-normal text-[#444650]">(recommended — audit trail)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="e.g., Last-minute instructor illness, goodwill for late reschedule"
            className={inputCls}
          />
        </div>
      </div>

      {error && <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Granting…' : 'Grant Token'}
        </button>
        <button
          onClick={() => router.push('/chia/lessons-events/tokens')}
          disabled={pending}
          className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
