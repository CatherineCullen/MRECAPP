'use client'

import { useState, useTransition } from 'react'
import { sendMonthInvoices, exportMonthInvoices, type SendMonthInvoicesResult } from '../actions'

const MONTH_LABEL = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

type Path = 'nmi' | 'export'

type Props = {
  year:           number
  month:          number
  pendingCount:   number
  pendingTotal:   number
  recipientCount: number
}

/**
 * Per-month "Send Invoices" button on the Monthly Subscriptions page. Opens
 * a modal that lets admin pick which path to send the batch through:
 *
 *   - **NMI** — calls NMI's add_invoice for each recipient; hosted
 *     pay-link emails out; webhook reconciles paid status. Outbound,
 *     gated by OUTBOUND_ENABLED.
 *   - **Export** — emits a CSV with one row per LessonMonth (grouped
 *     by chia invoice id). Admin handles billing externally and
 *     settles via manual mark-paid (PR 9a) once payment lands. No
 *     outbound; no kill-switch gate.
 *
 * Both paths flip lesson_month status to Invoiced + create the chia
 * `invoice` row. They differ in what NMI sees: NMI gets the invoice +
 * email; Export doesn't talk to NMI at all (the chia invoice is
 * stamped with `exported_at`).
 *
 * Result panel shape differs slightly:
 *   - NMI shows per-recipient outcomes (sent / errored)
 *   - Export shows summary + downloads the CSV (browser save dialog)
 */
export default function SendInvoicesButton({
  year, month, pendingCount, pendingTotal, recipientCount,
}: Props) {
  const [isOpen, setOpen] = useState(false)
  const [path, setPath] = useState<Path>('nmi')
  const [pending, startTransition] = useTransition()
  const [nmiResult, setNmiResult] = useState<SendMonthInvoicesResult | null>(null)
  const [exportSummary, setExportSummary] = useState<{
    invoiceCount: number
    lessonMonthCount: number
    totalAmount: number
    filename: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        if (path === 'nmi') {
          const r = await sendMonthInvoices({ year, month })
          setNmiResult(r)
        } else {
          const r = await exportMonthInvoices({ year, month })
          // Trigger browser download of the CSV.
          const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = r.filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          setExportSummary({
            invoiceCount:     r.invoiceCount,
            lessonMonthCount: r.lessonMonthCount,
            totalAmount:      r.totalAmount,
            filename:         r.filename,
          })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to process batch.')
      }
    })
  }

  function handleClose() {
    setOpen(false)
    setNmiResult(null)
    setExportSummary(null)
    setError(null)
    setPath('nmi')
  }

  if (pendingCount === 0) {
    return null
  }

  const showResult = nmiResult !== null || exportSummary !== null

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
            {!showResult ? (
              <>
                <h3 className="text-base font-bold text-[#191c1e] mb-2">
                  Send {MONTH_LABEL[month]} {year} invoices
                </h3>
                <p className="text-sm text-[#444650] mb-4">
                  {recipientCount} {recipientCount === 1 ? 'recipient' : 'recipients'} ·{' '}
                  {pendingCount} {pendingCount === 1 ? 'subscription month' : 'subscription months'} ·{' '}
                  <span className="font-semibold text-[#191c1e]">{fmtMoney(pendingTotal)}</span> total.
                  Riders with multiple slots get one invoice with multiple line items.
                </p>

                <fieldset className="mb-4 space-y-2">
                  <legend className="text-xs font-semibold text-[#191c1e] mb-1.5">How to send</legend>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="send-path"
                      value="nmi"
                      checked={path === 'nmi'}
                      onChange={() => setPath('nmi')}
                      className="mt-0.5 accent-[#002058]"
                    />
                    <span>
                      <span className="font-semibold text-[#191c1e]">NMI</span>
                      <span className="block text-[11px] text-[#444650]">
                        Hosted pay-link emails to riders. Webhook reconciles paid status.
                        Gated by <code className="text-[#191c1e]">OUTBOUND_ENABLED</code>.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="send-path"
                      value="export"
                      checked={path === 'export'}
                      onChange={() => setPath('export')}
                      className="mt-0.5 accent-[#002058]"
                    />
                    <span>
                      <span className="font-semibold text-[#191c1e]">Export CSV</span>
                      <span className="block text-[11px] text-[#444650]">
                        Downloads a CSV with one row per slot. Bill externally, then use
                        Mark Paid on each invoice once payment lands.
                      </span>
                    </span>
                  </label>
                </fieldset>

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
                    {pending
                      ? (path === 'nmi' ? 'Sending…' : 'Exporting…')
                      : (path === 'nmi' ? `Send via NMI` : `Export CSV`)}
                  </button>
                </div>
              </>
            ) : nmiResult !== null ? (
              <>
                <h3 className="text-base font-bold text-[#191c1e] mb-1">Send complete</h3>
                <p className="text-sm text-[#444650] mb-4">
                  <span className="font-semibold text-[#3a5a1a]">{nmiResult.totalSent} sent</span>
                  {nmiResult.totalErrored > 0 && (
                    <>{' · '}<span className="font-semibold text-[#8a1a1a]">{nmiResult.totalErrored} errored</span></>
                  )}
                </p>

                <div className="border border-[#c4c6d1]/40 rounded-lg overflow-y-auto max-h-72 mb-4">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-[#c4c6d1]/30">
                      {nmiResult.results.map((r) => (
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
            ) : exportSummary !== null ? (
              <>
                <h3 className="text-base font-bold text-[#191c1e] mb-1">Export complete</h3>
                <p className="text-sm text-[#444650] mb-2">
                  <span className="font-semibold text-[#191c1e]">{exportSummary.invoiceCount}</span> invoice{exportSummary.invoiceCount === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold text-[#191c1e]">{exportSummary.lessonMonthCount}</span> line item{exportSummary.lessonMonthCount === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold text-[#191c1e]">{fmtMoney(exportSummary.totalAmount)}</span> total
                </p>
                <p className="text-[11px] text-[#444650] mb-4">
                  Saved as <code className="text-[#191c1e]">{exportSummary.filename}</code>. Each invoice is now Sent in CHIA — bill externally,
                  then use the Mark Paid button on each invoice when payment lands.
                </p>

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
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
