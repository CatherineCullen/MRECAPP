'use client'

import { useState, useTransition } from 'react'
import { syncStripeCustomer, createTestInvoice } from '../actions'

type Invoice = {
  id: string
  status: string
  stripe_invoice_id: string | null
  sent_at: string | null
  paid_at: string | null
  due_date: string | null
  notes: string | null
  total: number
}

/**
 * Admin-only Stripe section on the person page.
 *
 * Two jobs:
 *   1. Sync a Stripe Customer (create if missing, show id if present)
 *   2. Send a one-off test invoice — the Phase B end-to-end smoke test
 *
 * The invoice history table reflects CHIA's `invoice` row, which is
 * updated by the webhook when Stripe reports payment. So if you pay the
 * invoice and the status doesn't flip here within a few seconds, the
 * webhook forwarder isn't running — check `stripe listen` in your
 * terminal.
 */
export default function PersonStripeSection({
  personId,
  initialStripeCustomerId,
  invoices: initialInvoices,
}: {
  personId: string
  initialStripeCustomerId: string | null
  invoices: Invoice[]
}) {
  const [stripeCustomerId, setStripeCustomerId] = useState(initialStripeCustomerId)
  const [invoices, setInvoices] = useState(initialInvoices)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showTestForm, setShowTestForm] = useState(false)

  // Test invoice form state
  const [description, setDescription] = useState('Test invoice')
  const [amount, setAmount] = useState('1.00')
  const [lastHostedUrl, setLastHostedUrl] = useState<string | null>(null)

  function handleSync() {
    setError(null)
    startTransition(async () => {
      const result = await syncStripeCustomer(personId)
      if (result.error) setError(result.error)
      else if (result.stripeCustomerId) setStripeCustomerId(result.stripeCustomerId)
    })
  }

  function handleSendTest(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLastHostedUrl(null)
    const amt = Number(amount)
    startTransition(async () => {
      const result = await createTestInvoice({
        personId,
        description,
        amount: amt,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.chiaInvoiceId && result.stripeInvoiceId) {
        setInvoices((prev) => [
          {
            id: result.chiaInvoiceId!,
            status: 'sent',
            stripe_invoice_id: result.stripeInvoiceId!,
            sent_at: new Date().toISOString(),
            paid_at: null,
            due_date: null,
            notes: null,
            total: amt,
          },
          ...prev,
        ])
      }
      setLastHostedUrl(result.hostedInvoiceUrl ?? null)
      setShowTestForm(false)
    })
  }

  const dashboardUrl = stripeCustomerId
    ? `https://dashboard.stripe.com/customers/${stripeCustomerId}`
    : null

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Stripe</h2>
        {stripeCustomerId && (
          <span className="text-[10px] font-semibold bg-[#d4f4dd] text-[#0a6b2a] px-1.5 py-0.5 rounded uppercase tracking-wider">
            Synced
          </span>
        )}
      </div>

      <div className="px-4 py-3 text-sm space-y-3">
        {/* Customer sync */}
        {stripeCustomerId ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">
                Customer ID
              </div>
              <div className="font-mono text-[#191c1e]">{stripeCustomerId}</div>
            </div>
            {dashboardUrl && (
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[#056380] hover:text-[#002058] shrink-0"
              >
                Open in Stripe ↗
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[#444650]">
              Not yet synced. Creating a Customer is required before this person can be invoiced.
            </div>
            <button
              onClick={handleSync}
              disabled={isPending}
              className="text-xs font-semibold bg-[#002058] text-white px-3 py-1.5 rounded hover:bg-[#001845] disabled:opacity-50"
            >
              {isPending ? 'Syncing…' : 'Sync to Stripe'}
            </button>
          </div>
        )}

        {/* Invoice history */}
        {stripeCustomerId && (
          <div className="pt-2 border-t border-[#e8edf4]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">
                Invoices
              </div>
              {!showTestForm && (
                <button
                  onClick={() => setShowTestForm(true)}
                  className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
                >
                  + Send test invoice
                </button>
              )}
            </div>

            {showTestForm && (
              <form
                onSubmit={handleSendTest}
                className="bg-[#f2f4f7] rounded p-3 space-y-2 mb-3"
              >
                <div>
                  <label className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider block mb-0.5">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-sm bg-white border border-[#c4c6d1] rounded px-2 py-1"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider block mb-0.5">
                    Amount (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-32 text-sm bg-white border border-[#c4c6d1] rounded px-2 py-1"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="text-xs font-semibold bg-[#002058] text-white px-3 py-1.5 rounded hover:bg-[#001845] disabled:opacity-50"
                  >
                    {isPending ? 'Sending…' : 'Send invoice'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTestForm(false)}
                    className="text-xs font-semibold text-[#444650] px-3 py-1.5 rounded hover:bg-[#e8edf4]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {lastHostedUrl && (
              <div className="mb-3 text-xs bg-[#e8f4fd] text-[#002058] px-3 py-2 rounded">
                Invoice sent.{' '}
                <a
                  href={lastHostedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  Open hosted invoice ↗
                </a>
              </div>
            )}

            {invoices.length === 0 ? (
              <div className="text-xs text-[#8c8e98] italic">No invoices yet.</div>
            ) : (
              <div className="divide-y divide-[#e8edf4]">
                {invoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-xs text-[#b02020]">{error}</div>}
      </div>
    </section>
  )
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const statusColor: Record<string, string> = {
    draft: 'bg-[#e8edf4] text-[#444650]',
    pending_review: 'bg-[#e8edf4] text-[#444650]',
    sent: 'bg-[#e8f4fd] text-[#002058]',
    opened: 'bg-[#e8f4fd] text-[#002058]',
    paid: 'bg-[#d4f4dd] text-[#0a6b2a]',
    overdue: 'bg-[#ffe0e0] text-[#b02020]',
  }
  const color = statusColor[invoice.status] ?? 'bg-[#e8edf4] text-[#444650]'
  const stripeUrl = invoice.stripe_invoice_id
    ? `https://dashboard.stripe.com/invoices/${invoice.stripe_invoice_id}`
    : null
  return (
    <div className="py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${color}`}
        >
          {invoice.status}
        </span>
        <span className="text-sm text-[#191c1e] tabular-nums">
          ${Number(invoice.total).toFixed(2)}
        </span>
        {invoice.paid_at ? (
          <span className="text-xs text-[#8c8e98]">
            paid {new Date(invoice.paid_at).toLocaleDateString()}
          </span>
        ) : invoice.sent_at ? (
          <span className="text-xs text-[#8c8e98]">
            sent {new Date(invoice.sent_at).toLocaleDateString()}
          </span>
        ) : null}
      </div>
      <a
        href={`/chia/invoices/${invoice.id}`}
        target="_blank"
        rel="noopener"
        className="text-xs font-semibold text-[#056380] hover:text-[#002058] shrink-0"
      >
        Details ↗
      </a>
      {stripeUrl && (
        <a
          href={stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[#056380] hover:text-[#002058] shrink-0"
        >
          Stripe ↗
        </a>
      )}
    </div>
  )
}
