'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { generateBoardInvoices } from '../actions'

/**
 * Month-end generator for Boarding.
 *
 * Targets every Reviewed billing_line_item in the open queue. Admin picks
 * the period (defaults: first-of-current-month → today) and fires. We
 * group allocations by person on the server, create one Stripe draft +
 * one CHIA invoice per person, and stamp the source billing_line_items
 * with the period so they fall off the queue.
 *
 * We intentionally don't show the per-person result list here — the admin's
 * next step is the Invoices tab, where they actually review + send. The
 * success note on this panel is just a handoff cue.
 */

type Props = {
  totalReviewed: number
}

function firstOfMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

type Summary = { successCount: number; failureCount: number }

export default function GenerateInvoices({ totalReviewed }: Props) {
  const [open, setOpen]                 = useState(false)
  const [periodStart, setPeriodStart]   = useState(firstOfMonth())
  const [periodEnd, setPeriodEnd]       = useState(today())
  const [summary, setSummary]           = useState<Summary | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()

  const disabled = totalReviewed <= 0

  function handleGenerate() {
    setError(null)
    setSummary(null)
    startTransition(async () => {
      const res = await generateBoardInvoices({ periodStart, periodEnd })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const successCount = res.results.filter(r => r.ok).length
      const failureCount = res.results.filter(r => !r.ok).length
      setSummary({ successCount, failureCount })
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? 'Approve at least one line item first' : undefined}
        className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Generate invoices…
      </button>
    )
  }

  return (
    <div className="bg-white rounded border border-[#c4c6d1]/40 p-4 space-y-3">
      <div className="flex items-baseline gap-3">
        <h3 className="text-[#191c1e] font-semibold text-sm">Generate invoices</h3>
        <span className="text-xs text-[#8c8e98]">
          Creates Stripe drafts from all Reviewed items. Drafts are not sent — review + send from the Invoices tab.
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { setOpen(false); setSummary(null); setError(null) }}
          disabled={isPending}
          className="text-xs text-[#8c8e98] hover:text-[#444650] disabled:opacity-40"
        >
          Close
        </button>
      </div>

      {!summary && (
        <>
          <div className="flex items-end gap-3">
            <label className="text-xs text-[#444650]">
              <span className="block mb-0.5 text-[#8c8e98]">Period start</span>
              <input
                type="date"
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className="px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
              />
            </label>
            <label className="text-xs text-[#444650]">
              <span className="block mb-0.5 text-[#8c8e98]">Period end</span>
              <input
                type="date"
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className="px-2 py-1 text-sm font-mono border border-[#c4c6d1] rounded bg-white focus:outline-none focus:border-[#002058]"
              />
            </label>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
            >
              {isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {error && <div className="text-xs text-[#8f3434]">{error}</div>}
        </>
      )}

      {summary && (
        <div className="text-xs text-[#444650] space-y-1">
          {summary.successCount === 0 && summary.failureCount === 0 ? (
            <div className="text-[#8c8e98]">Nothing to invoice — no Reviewed items in the queue.</div>
          ) : (
            <>
              <div>
                <strong className="text-[#002058]">
                  {summary.successCount} draft{summary.successCount === 1 ? '' : 's'} created.
                </strong>{' '}
                Not sent yet — review + send from{' '}
                <Link href="/chia/boarding/drafts" className="text-[#002058] underline hover:no-underline">
                  Invoices
                </Link>.
              </div>
              {summary.failureCount > 0 && (
                <div className="text-[#8f3434]">
                  {summary.failureCount} failed — their charges stayed in the queue for retry.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
