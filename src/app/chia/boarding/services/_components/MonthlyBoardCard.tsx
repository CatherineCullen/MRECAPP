'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMonthlyBoardRate } from '../actions'

/**
 * Monthly Board is the one recurring service — every active boarder horse gets
 * one automatically on their monthly invoice. No logging, no QR code. Only
 * thing the admin can edit is the flat rate.
 */
export default function MonthlyBoardCard({
  id,
  unitPrice,
}: {
  id:         string
  unitPrice:  number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [price, setPrice]     = useState(unitPrice?.toString() ?? '')
  const [error, setError]     = useState<string | null>(null)

  void id  // reserved — currently the action finds the row via is_recurring_monthly

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await updateMonthlyBoardRate(price === '' ? 0 : Number(price))
      if (r.error) { setError(r.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-bold text-[#191c1e]">Monthly Board</h2>
            <span className="text-[10px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded">
              Recurring
            </span>
          </div>
          <p className="text-xs text-[#444650] leading-relaxed">
            Added automatically to every active boarder's monthly invoice.
            No logging required; admin can override the amount per invoice during review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <span className="text-xs text-[#444650]">$</span>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                autoFocus
                className="w-24 text-sm text-right border border-[#c4c6d1] rounded px-2 py-1 focus:outline-none focus:border-[#002058]"
              />
              <button
                onClick={save}
                disabled={pending}
                className="text-xs font-semibold text-white bg-[#002058] px-2.5 py-1 rounded hover:bg-[#003099] disabled:opacity-50"
              >
                {pending ? '…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setPrice(unitPrice?.toString() ?? ''); setError(null) }}
                disabled={pending}
                className="text-xs text-[#444650] hover:text-[#191c1e]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-[#191c1e]">
                {unitPrice != null ? `$${Number(unitPrice).toFixed(2)}` : <span className="text-[#c4c6d1]">not set</span>}
              </span>
              <span className="text-xs text-[#444650]">/ month</span>
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-semibold text-[#002058] px-2 py-1 rounded hover:bg-[#dae2ff]/40 ml-2"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="mt-2 text-[10px] text-red-700">{error}</div>}
    </div>
  )
}
