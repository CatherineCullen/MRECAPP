'use client'

import { useState, useTransition } from 'react'
import { sendMonthInvoices, type SendMonthInvoicesResult } from '../actions'

const MONTH_LABEL = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

type Props = {
  year:           number
  /** 1-12 */
  month:          number
  /** Number of Pending lesson_months that would be sent. */
  pendingCount:   number
  /** Sum of those lesson_months' totals. */
  pendingTotal:   number
  /** Number of distinct billed-to people = number of invoices we'll create. */
  recipientCount: number
}

/**
 * Per-month "Send Invoices" button on the Monthly Billing page.
 * Sends all Pending lesson_months in that calendar month via the NMI
 * adapter — one invoice per billed-to person, bundling multiple slots
 * (per ADR-0019).
 *
 * UX flow: button -> confirm dialog (count + total + recipient count) ->
 * server-action loop -> result panel showing per-recipient outcomes.
 *
 * In dev with OUTBOUND_ENABLED unset, every send fails with the
 * kill-switch error — that's expected, admin sets the env var when
 * ready to send for real.
 */
export default function SendInvoicesButton({
  year, month, pendingCount, pendingTotal, recipientCount,
}: Props) {
  const [isOpen, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SendMonthInvoicesResult | null>(null)
  const [error, setError]   = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await sendMonthInvoices({ year, month })
        setResult(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send invoices.')
      }
    })
  }

  function handleClose() {
    setOpen(false)
    setResult(null)
    setError(null)
  }

  if (pendingCount === 0) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors"
      >
        Send Invoices ({pendingCount})
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && !pending && handleClose()}
        >
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl">
            {!result ? (
              <>
                <h3 className="text-base font-bold text-[#191c1e] mb-2">
                  Send {MONTH_LABEL[month]} {year} invoices
                </h3>
                <p className="text-sm text-[#444650] mb-4">
                  This will send {recipientCount} {recipientCount === 1 ? 'invoice' : 'invoices'} via NMI for{' '}
                  {pendingCount} {pendingCount === 1 ? 'subscription month' : 'subscription months'}, totaling{' '}
                  <span className="font-semibold text-[#191c1e]">{fmtMoney(pendingTotal)}</span>.
                  Riders with multiple slots get one invoice with multiple line items.
                </p>
                <p className="text-[11px] text-[#7a5a00] mb-4">
                  Outbound sending is gated by <code className="text-[#191c1e]">OUTBOUND_ENABLED</code>.
                  In sandbox / dev this will fail per-recipient with the kill-switch error — that&apos;s expected
                  until production.
                </p>

                {error && (
                  <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
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
                    {pending ? 'Sending…' : `Send ${recipientCount} ${recipientCount === 1 ? 'invoice' : 'invoices'}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-[#191c1e] mb-1">
                  Send complete
                </h3>
                <p className="text-sm text-[#444650] mb-4">
                  <span className="font-semibold text-[#3a5a1a]">{result.totalSent} sent</span>
                  {result.totalErrored > 0 && (
                    <>{' · '}<span className="font-semibold text-[#8a1a1a]">{result.totalErrored} errored</span></>
                  )}
                </p>

                <div className="border border-[#c4c6d1]/40 rounded-lg overflow-y-auto max-h-72 mb-4">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-[#c4c6d1]/30">
                      {result.results.map((r) => (
                        <tr key={r.billedToId} className="bg-white">
                          <td className="px-3 py-2 align-top">
                            <div className="font-semibold text-[#191c1e]">{r.billedToName}</div>
                            <div className="text-[10px] text-[#444650]">
                              {r.lessonMonthCount} {r.lessonMonthCount === 1 ? 'line' : 'lines'} · {fmtMoney(r.total)}
                            </div>
                            {r.error && (
                              <div className="text-[10px] text-[#8a1a1a] mt-1 break-words">{r.error}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {r.success ? (
                              <span className="text-[10px] font-semibold text-[#3a5a1a] uppercase tracking-wide">Sent</span>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#8a1a1a] uppercase tracking-wide">Errored</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="bg-[#002058] text-white text-sm font-semibold px-4 py-2 rounded hover:bg-[#003099] transition-colors"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
