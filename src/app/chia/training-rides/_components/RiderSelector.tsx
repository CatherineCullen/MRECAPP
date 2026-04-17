'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

type Provider = {
  id:            string
  name:          string
  rides_60d:     number   // ride count in the last 60 days (for sort hint)
  rate:          number   // numeric(10,2) from default_training_ride_rate
}

type Props = {
  providers:      Provider[]
  selectedId:     string | null
}

export default function RiderSelector({ providers, selectedId }: Props) {
  const router        = useRouter()
  const pathname      = usePathname()
  const searchParams  = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    const v = e.target.value
    if (v) params.set('rider', v)
    else   params.delete('rider')
    router.push(`${pathname}?${params.toString()}`)
  }

  const selected = providers.find(p => p.id === selectedId)

  return (
    <div className="flex items-center gap-3">
      <label className="text-[10px] text-[#444650] font-bold uppercase tracking-widest">Provider</label>
      <select
        value={selectedId ?? ''}
        onChange={handleChange}
        className="min-w-[240px] border-2 border-[#002058] rounded px-3 py-2 text-lg font-bold text-[#191c1e] bg-white focus:outline-none focus:ring-2 focus:ring-[#002058]/30"
      >
        <option value="">— Select provider —</option>
        {providers.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}{p.rides_60d > 0 ? ` · ${p.rides_60d} recent` : ''}
          </option>
        ))}
      </select>
      {selected && (
        <span className="text-xs text-[#444650]">
          Rate: <span className="font-semibold text-[#191c1e]">${selected.rate.toFixed(2)}</span>/ride
        </span>
      )}
      {providers.length === 0 && (
        <span className="text-xs text-[#7a5a00]">
          No training ride providers yet. Flag someone in People with <span className="font-semibold">is_training_ride_provider</span>.
        </span>
      )}
    </div>
  )
}
