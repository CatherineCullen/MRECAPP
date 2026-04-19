import { createAdminClient } from '@/lib/supabase/admin'
import { loadRenewalSnapshot } from '../_lib/quarterlyRenewal'
import RenewalTable from './_components/RenewalTable'
import RecipientsPanel from './_components/RecipientsPanel'

// Quarterly Renewal > Roster sub-tab. The core workflow:
//   1. Review the list. Flip anyone to Not Renewing (or wait for rider opt-out).
//   2. Click "Add N to <Next Season> calendar" to clone renewing rows into
//      pending subs + pending lessons in the next quarter.
//   3. Generate invoices (bulk action) — the drafts appear in the Invoices
//      sub-tab. Admin reviews and sends from there.
//
// Roster + Invoices were split because the rider list scales with the
// barn; anything stacked beneath it would fall off-screen.

export default async function QuarterlyRenewalRosterPage() {
  const db = createAdminClient()
  const snapshot = await loadRenewalSnapshot(db)

  if (!snapshot.currentQuarter) {
    return (
      <div className="bg-white rounded-lg px-4 py-8 text-center max-w-md">
        <p className="text-sm font-semibold text-[#191c1e] mb-1">No active quarter</p>
        <p className="text-xs text-[#444650]">
          Activate a quarter in Configuration &gt; Quarters to start using the renewal tab.
        </p>
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
    <>
      <div className="mb-5">
        <h2 className="text-sm font-bold text-[#191c1e]">
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
    </>
  )
}
