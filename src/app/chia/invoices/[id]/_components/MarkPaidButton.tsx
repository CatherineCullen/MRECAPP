'use client'

import { useState, useTransition } from 'react'
import { markInvoicePaid, type ManualPaidMethod } from '../actions'

const METHODS: Array<{ value: ManualPaidMethod; label: string; hint: string }> = [
  { value: 'cash',           label: 'Cash',           hint: 'Cash received in person' },
  { value: 'check',          label: 'Check',          hint: 'Paper check received' },
  { value: 'poynt_terminal', label: 'Poynt Terminal', hint: 'Card swiped on the in-barn Poynt terminal' },
  { value: 'external',       label: 'External NMI',   hint: 'Card charged manually in the NMI portal' },
  { value: 'other',          label: 'Other',          hint: 'ACH, money order, anything else' },
]

/**
 * Admin-only "Mark Paid" button for the invoice detail page. Works for
 * any invoice in `sent` or `overdue` status. Triggers the same
 * downstream cascade as a NMI webhook payment (lesson_month → Paid,
 * lessons → scheduled).
 *
 * UX flow: button → modal with method radio → confirm → action runs →
 * page revalidates and renders Paid state.
 */
export default function MarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [isOpen, setOpen] = useState(false)
  const [method, setMethod] = useState<ManualPaidMethod>('cash')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await markInvoicePaid({ invoiceId, method })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      // The revalidatePath calls in the action refresh the page; nothing more to do here.
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors"
      >
        Mark Paid
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
        >
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#191c1e] mb-1">Mark invoice paid</h3>
            <p className="text-sm text-[#444650] mb-4">
              Records the payment in CHIA without sending anything outbound. Use for cash,
              check, or payments charged manually in the NMI portal. Triggers the same
              downstream effect as a NMI webhook payment (subscription lessons → scheduled).
            </p>

            <fieldset className="mb-4 space-y-2">
              <legend className="text-xs font-semibold text-[#191c1e] mb-1.5">Payment method</legend>
              {METHODS.map((m) => (
                <label key={m.value} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="paid-method"
                    value={m.value}
                    checked={method === m.value}
                    onChange={() => setMethod(m.value)}
                    className="mt-0.5 accent-[#002058]"
                  />
                  <span>
                    <span className="font-semibold text-[#191c1e]">{m.label}</span>
                    <span className="block text-[11px] text-[#444650]">{m.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {error && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-sm text-[#444650] font-semibold px-4 py-2 rounded hover:bg-[#e8eaf0] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] disabled:opacity-50 transition-colors"
              >
                {pending ? 'Marking…' : 'Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
