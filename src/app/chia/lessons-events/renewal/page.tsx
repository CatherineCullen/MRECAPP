import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRenewalSnapshot } from '../_lib/quarterlyRenewal'
import { loadLessonDrafts, loadLessonSent } from '../invoices/_lib/loadLessonInvoices'
import RenewalTable from './_components/RenewalTable'
import RecipientsPanel from './_components/RecipientsPanel'
import InvoicesSwitcher from '../invoices/_components/InvoicesSwitcher'

// Quarterly Renewal tab — always live. Shows the current-quarter subs + their
// renewal status for the following quarter. The default posture is "everyone
// is renewing unless someone says otherwise." Admin workflow:
//
//   1. Review the list. Flip anyone to Not Renewing (or wait for rider opt-out).
//   2. Click "Create Pending for <Next Season>" to clone the renewing rows
//      into pending subs + pending lessons in the next quarter.
//   3. Send invoices (separate action — lands in the Invoices tab, same
//      pattern as Boarders > Invoices).
//
// This page is intentionally boring: one table, one bulk button, per-row
// status. No wizard, no stepper.

export default async function QuarterlyRenewalPage() {
  const db = createAdminClient()
  const [snapshot, drafts, sent] = await Promise.all([
    loadRenewalSnapshot(db),
    loadLessonDrafts('renewal'),
    loadLessonSent('renewal'),
  ])

  if (!snapshot.currentQuarter) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg px-4 py-8 text-center max-w-md">
          <p className="text-sm font-semibold text-[#191c1e] mb-1">No active quarter</p>
          <p className="text-xs text-[#444650]">
            Activate a quarter in Configuration &gt; Quarters to start using the renewal tab.
          </p>
        </div>
      </div>
    )
  }

  const renewing    = snapshot.rows.filter(r => r.renewalIntent === 'renewing')
  const notRenewing = snapshot.rows.filter(r => r.renewalIntent === 'not_renewing')

  // "Ready to create" = renewing rows that don't yet have a pending sub in
  // the next quarter. This drives the bulk-action button's count.
  const readyCount = renewing.filter(r => !r.alreadyPending).length
  const alreadyCount = renewing.filter(r => r.alreadyPending).length

  return (
    <div className="p-6">
      <div className="mb-5">
        <Link
          href="/chia/lessons-events"
          className="text-xs text-[#444650] hover:text-[#002058] hover:underline"
        >
          ← Calendar
        </Link>
        <h2 className="text-sm font-bold text-[#191c1e] mt-1">
          Quarterly Renewal — {snapshot.currentQuarter.label}
          {snapshot.nextQuarter && (
            <span className="text-[#444650] font-normal"> → {snapshot.nextQuarter.label}</span>
          )}
        </h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Everyone renews by default. Flip individual rows to Not Renewing, then create pending
          subscriptions for {snapshot.nextQuarter?.label ?? 'the next quarter'}.
        </p>
      </div>

      {!snapshot.nextQuarter && (
        <div className="bg-[#fff8e5] border border-[#f0c14b] rounded-md px-3 py-2 text-xs text-[#6b4a00] mb-4">
          No next quarter exists yet. Create one in Configuration &gt; Quarters before running renewal.
        </div>
      )}

      {/* Summary strip */}
      <div className="flex gap-4 mb-4 text-xs">
        <div className="bg-white rounded-md px-3 py-2">
          <div className="text-[#444650]">Renewing</div>
          <div className="text-sm font-bold text-[#191c1e]">{renewing.length}</div>
        </div>
        <div className="bg-white rounded-md px-3 py-2">
          <div className="text-[#444650]">Already pending</div>
          <div className="text-sm font-bold text-[#191c1e]">{alreadyCount}</div>
        </div>
        <div className="bg-white rounded-md px-3 py-2">
          <div className="text-[#444650]">Not renewing</div>
          <div className="text-sm font-bold text-[#191c1e]">{notRenewing.length}</div>
        </div>
      </div>

      <RenewalTable
        rows={snapshot.rows}
        nextQuarterId={snapshot.nextQuarter?.id ?? null}
        nextQuarterLabel={snapshot.nextQuarter?.label ?? null}
        readyCount={readyCount}
        canCreate={!!snapshot.nextQuarter}
        pendingUninvoicedCount={snapshot.pendingUninvoicedCount}
      />

      <RecipientsPanel recipients={snapshot.renewalRecipients} />

      {/* Renewal Invoices — drafts + sent for next-quarter subs. Lives under
          the Renewal tab (not a separate Invoices tab) because the full
          renewal lifecycle reads best as one place: pick who renews → create
          pending → generate invoices → track sent/paid. */}
      {(drafts.drafts.length > 0 || sent.groups.length > 0) && (
        <div className="mt-8 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-[#ecedf2]">
            <h3 className="text-sm font-semibold text-[#191c1e]">Renewal Invoices</h3>
            <p className="text-xs text-[#444650] mt-0.5">
              Drafts and sent invoices for {snapshot.nextQuarter?.label ?? 'next quarter'}.
              One-off invoices for the current quarter live under the Invoices tab.
            </p>
          </div>
          <InvoicesSwitcher drafts={drafts} sent={sent} />
        </div>
      )}
    </div>
  )
}
