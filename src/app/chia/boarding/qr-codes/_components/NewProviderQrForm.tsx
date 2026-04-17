'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProviderQr } from '../actions'

export type PersonOption  = { id: string; name: string }
export type ServiceOption = { id: string; name: string; is_billable: boolean }

/**
 * Inline form at the foot of the per-provider table. Admin picks a provider
 * Person (must already have the service_provider role) and a service, then
 * Create — the token is generated server-side.
 */
export default function NewProviderQrForm({ providers, services }: {
  providers: PersonOption[]
  services:  ServiceOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState('')
  const [serviceId,  setServiceId]  = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    if (!providerId || !serviceId) { setError('Pick a provider and a service'); return }
    startTransition(async () => {
      const r = await createProviderQr({ providerPersonId: providerId, serviceId })
      if (r.error) { setError(r.error); return }
      setProviderId('')
      setServiceId('')
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <div className="px-4 py-2 border-t border-[#c4c6d1]/30">
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-[#002058] hover:underline"
        >
          + New provider code
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-t border-[#c4c6d1]/30 bg-[#f7f9fc] flex flex-wrap items-center gap-2">
      <label className="text-[10px] font-semibold text-[#444650]">Provider</label>
      <select
        value={providerId}
        onChange={e => setProviderId(e.target.value)}
        className="text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058] bg-white"
      >
        <option value="">— pick —</option>
        {providers.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <label className="text-[10px] font-semibold text-[#444650] ml-2">Service</label>
      <select
        value={serviceId}
        onChange={e => setServiceId(e.target.value)}
        className="text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058] bg-white"
      >
        <option value="">— pick —</option>
        {services.map(s => (
          <option key={s.id} value={s.id}>{s.name}{s.is_billable ? '' : ' (non-billable)'}</option>
        ))}
      </select>

      <button
        onClick={submit}
        disabled={pending}
        className="text-xs font-semibold text-white bg-[#002058] px-2.5 py-1 rounded hover:bg-[#003099] disabled:opacity-50 ml-auto"
      >
        {pending ? '…' : 'Create'}
      </button>
      <button
        onClick={() => { setOpen(false); setProviderId(''); setServiceId(''); setError(null) }}
        disabled={pending}
        className="text-xs text-[#444650] hover:text-[#191c1e]"
      >
        Cancel
      </button>
      {providers.length === 0 && (
        <div className="w-full text-[10px] text-[#7a5a00]">
          No Service Provider people exist yet. Add one in People → give them the Service Provider role.
        </div>
      )}
      {error && <div className="w-full text-[10px] text-red-700">{error}</div>}
    </div>
  )
}
