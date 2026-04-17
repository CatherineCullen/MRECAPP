'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertService } from '../actions'

/**
 * Appears at the bottom of each service section. Click "+ Add" to expand an
 * inline form; billable vs non-billable is fixed by the section the button
 * lives in (no toggle — the two lists are semantically different).
 */
export default function NewServiceRow({ isBillable }: { isBillable: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen]             = useState(false)
  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice]           = useState('')
  const [error, setError]           = useState<string | null>(null)

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await upsertService({
        name,
        description,
        is_billable: isBillable,
        unit_price:  isBillable ? (price === '' ? null : Number(price)) : null,
      })
      if (r.error) { setError(r.error); return }
      setName('')
      setDescription('')
      setPrice('')
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={4} className="py-2 px-3">
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-[#002058] hover:underline"
          >
            + Add a {isBillable ? 'billable' : 'non-billable'} service
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="bg-[#f7f9fc]">
      <td className="py-1.5 px-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          autoFocus
          className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
        />
      </td>
      <td className="py-1.5 px-3">
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full text-xs border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
        />
      </td>
      <td className="py-1.5 px-3">
        {isBillable ? (
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
          disabled={pending || !name.trim()}
          className="text-xs font-semibold text-white bg-[#002058] px-2 py-1 rounded hover:bg-[#003099] disabled:opacity-50 mr-1.5"
        >
          {pending ? '…' : 'Add'}
        </button>
        <button
          onClick={() => { setOpen(false); setName(''); setDescription(''); setPrice(''); setError(null) }}
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
