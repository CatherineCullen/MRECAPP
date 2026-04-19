import { createAdminClient } from '@/lib/supabase/admin'
import { loadRenewalSnapshot } from '../../_lib/quarterlyRenewal'
import { loadLessonDrafts, loadLessonSent } from '../../invoices/_lib/loadLessonInvoices'
import InvoicesSwitcher from '../../invoices/_components/InvoicesSwitcher'

// Renewal > Invoices sub-tab. Drafts + Sent for next-quarter subscriptions.
// The Roster page holds the list of riders and the bulk "generate invoices"
// action; this page is strictly the invoice triage lane.
//
// Scope is 'renewal' — invoices tied to next-quarter subs. Current-quarter
// one-off invoices (mid-quarter signups, extras, events) live under the
// top-level Invoices tab.

export default async function RenewalInvoicesPage() {
  const db = createAdminClient()
  const [snapshot, drafts, sent] = await Promise.all([
    loadRenewalSnapshot(db),
    loadLessonDrafts('renewal'),
    loadLessonSent('renewal'),
  ])

  const nextLabel = snapshot.nextQuarter?.label ?? 'next quarter'
  const hasAny = drafts.drafts.length > 0 || sent.groups.length > 0

  return (
    <>
      <div className="mb-5">
        <h2 className="text-sm font-bold text-[#191c1e]">
          Renewal Invoices
          <span className="text-[#444650] font-normal"> — {nextLabel}</span>
        </h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Drafts and sent invoices for next-quarter subscriptions. One-off invoices for the
          current quarter live under the Invoices tab.
        </p>
      </div>

      {!hasAny ? (
        <div className="bg-white rounded-lg px-4 py-10 text-center max-w-md">
          <p className="text-sm font-semibold text-[#191c1e] mb-1">No renewal invoices yet</p>
          <p className="text-xs text-[#444650]">
            Flip renewing riders to pending on the Roster tab, then bulk-generate invoices.
            Drafts will appear here for review before sending.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg overflow-hidden">
          <InvoicesSwitcher drafts={drafts} sent={sent} />
        </div>
      )}
    </>
  )
}
