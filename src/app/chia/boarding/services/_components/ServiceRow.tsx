'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertService, setServiceActive } from '../actions'

export type ServiceRowData = {
  id:          string
  name:        string
  description: string | null
  is_billable: boolean
  unit_price:  number | null
  is_active:   boolean
}

/**
 * Editable row for an a la carte service. Click "Edit" to enter inline edit
 * mode; price is only shown for billable services. Deactivation is a toggle.
 */
export default function ServiceRow({ service }: { service: ServiceRowData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local edit state
  const [name,        setName]        = useState(service.name)
  const [description, setDescription] = useState(service.description ?? '')
  const [price,       setPrice]       = useState(service.unit_price?.toString() ?? '')

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await upsertService({
        id:          service.id,
        name,
        description,
        is_billable: service.is_billable,
        unit_price:  service.is_billable ? (price === '' ? null : Number(price)) : null,
      })
      if (r.error) { setError(r.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  function toggleActive() {
    setError(null)
    startTransition(async () => {
      const r = await setServiceActive(service.id, !service.is_active)
      if (r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  if (editing) {
    return (
      <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
        <td className="py-1.5 px-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
          />
        </td>
        <td className="py-1.5 px-3">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="(none)"
            className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
          />
        </td>
        <td className="py-1.5 px-3">
          {service.is_billable ? (
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-20 text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
            />
          ) : (
            <span className="text-xs text-[#c4c6d1]">—</span>
          )}
        </td>
        <td className="py-1.5 px-3 text-right whitespace-nowrap">
          <button
            onClick={save}
            disabled={pending}
            className="text-xs font-semibold text-white bg-[#002058] px-2 py-1 rounded hover:bg-[#003099] disabled:opacity-50 mr-1.5"
          >
            {pending ? '…' : 'Save'}
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setName(service.name)
              setDescription(service.description ?? '')
              setPrice(service.unit_price?.toString() ?? '')
              setError(null)
            }}
            disabled={pending}
            className="text-xs text-[#444650] hover:text-[#191c1e]"
          >
            Cancel
          </button>
          {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
        </td>
      </tr>
    )
  }

  return (
    <tr className={`border-b border-[#c4c6d1]/30 ${service.is_active ? '' : 'opacity-50'}`}>
      <td className="py-1.5 px-3 text-xs font-semibold text-[#191c1e]">{service.name}</td>
      <td className="py-1.5 px-3 text-xs text-[#444650]">{service.description || <span className="text-[#c4c6d1]">—</span>}</td>
      <td className="py-1.5 px-3 text-xs text-[#191c1e]">
        {service.is_billable
          ? (service.unit_price != null
              ? `$${Number(service.unit_price).toFixed(2)}`
              : <span className="text-[#c4c6d1]">—</span>)
          : <span className="text-[10px] text-[#444650] italic">not billed</span>}
      </td>
      <td className="py-1.5 px-3 text-right whitespace-nowrap">
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-[#002058] px-2 py-1 rounded hover:bg-[#dae2ff]/40 mr-1"
        >
          Edit
        </button>
        <button
          onClick={toggleActive}
          disabled={pending}
          className={`text-xs font-semibold px-2 py-1 rounded transition-colors disabled:opacity-50 ${
            service.is_active
              ? 'text-[#8a1a1a] hover:bg-[#ffd6d6]/30'
              : 'text-[#1a6b3c] hover:bg-[#b7f0d0]/40'
          }`}
        >
          {service.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
      </td>
    </tr>
  )
}
