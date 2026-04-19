'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProviderRate } from '@/app/chia/training-rides/actions'

/**
 * Service-catalog row for a training-ride provider. Mirrors the shape of
 * ServiceRow (Name / Description / Price / edit affordance) so the catalog
 * reads consistently, even though the underlying entity is `person`, not
 * `board_service`. Editing the price updates `person.default_training_ride_rate`.
 *
 * Snapshot reminder lives in the section header, not per-row, to keep rows
 * compact.
 */
export type ProviderRowData = {
  id:          string
  name:        string
  rate:        number
  recent60d:   number
}

export default function TrainingRideProviderRow({ provider }: { provider: ProviderRowData }) {
  const router = useRouter()
  const [editing, setEditing]         = useState(false)
  const [draft, setDraft]             = useState(provider.rate.toString())
  const [error, setError]             = useState<string | null>(null)
  const [pending, startTransition]    = useTransition()

  function save() {
    setError(null)
    const parsed = Number(draft === '' ? '0' : draft)
    startTransition(async () => {
      const r = await updateProviderRate({ providerId: provider.id, newRate: parsed })
      if (r.error) { setError(r.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <tr className="border-b border-[#c4c6d1]/20 last:border-b-0">
      <td className="py-1.5 px-3">
        <Link
          href={`/chia/people/${provider.id}`}
          className="text-sm font-semibold text-[#191c1e] hover:text-[#002058] hover:underline"
        >
          {provider.name}
        </Link>
      </td>
      <td className="py-1.5 px-3 text-xs text-[#444650]">
        {provider.recent60d > 0
          ? `${provider.recent60d} ride${provider.recent60d === 1 ? '' : 's'} in last 60d`
          : <span className="text-[#c4c6d1]">no recent rides</span>}
      </td>
      <td className="py-1.5 px-3">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#444650]">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') { setEditing(false); setDraft(provider.rate.toString()); setError(null) }
              }}
              className="w-20 text-sm text-right border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
            />
          </div>
        ) : (
          <span className="text-sm font-semibold text-[#191c1e]">
            ${provider.rate.toFixed(2)}<span className="text-[10px] font-normal text-[#444650]"> /ride</span>
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 text-right">
        {editing ? (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={save}
              disabled={pending}
              className="text-xs font-semibold text-white bg-[#002058] px-2 py-1 rounded hover:bg-[#003099] disabled:opacity-50"
            >
              {pending ? '…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(provider.rate.toString()); setError(null) }}
              disabled={pending}
              className="text-xs text-[#444650] hover:text-[#191c1e]"
            >
              Cancel
            </button>
            {error && <span className="text-[10px] text-red-700 ml-1">{error}</span>}
          </div>
        ) : (
          <button
            onClick={() => { setDraft(provider.rate.toString()); setEditing(true); setError(null) }}
            className="text-xs font-semibold text-[#002058] px-2 py-1 rounded hover:bg-[#dae2ff]/40"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  )
}
