import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import { addMonths, monthOfIso, todayIso } from '@/lib/lessons/monthly/dates'
import MonthlyBillingTable from './_components/MonthlyBillingTable'
import SendInvoicesButton from './_components/SendInvoicesButton'

const MONTH_LABEL = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const DAY_LABEL: Record<string, string> = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

/**
 * Monthly Billing tab (ADR-0019, replaces the deleted Quarterly Renewal UI).
 *
 * Always-live curation surface. Default view: current month + next two
 * months of `lesson_month` rows, grouped by month. Admin can mark a
 * subscription as not continuing per row (clears its pending months
 * forward).
 *
 * Out of scope for v1 (follow-up PRs): batch Send Invoices with NMI/
 * Export fork, edit per-month per-lesson price, history tab for past
 * months. The minimum scope here re-enables admin's continuation
 * control so PR 3b-rest can drop the legacy renewal_intent code paths.
 */
export default async function MonthlyBillingPage() {
  const supabase = createAdminClient()

  const today = todayIso()
  const { year, month } = monthOfIso(today)
  const windowEnd = addMonths(year, month, 2)

  // Pull lesson_month rows for current + next 2 months. Inner-join up
  // through the slot subscription to its rider, billed-to, and
  // instructor for display. Status filter: surface Pending and Invoiced
  // (the rows admin actively manages); Paid + Cancelled are out of
  // scope for the current view.
  const { data: months, error } = await supabase
    .from('lesson_month')
    .select(`
      id, year, month, lesson_count, per_lesson_price, total, status, is_prorated,
      lesson_subscription!inner (
        id, lesson_day, lesson_time, subscription_type, ended_at, billed_to_id,
        rider:person!lesson_subscription_rider_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
        billed_to:person!lesson_subscription_billed_to_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
        instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      )
    `)
    .is('deleted_at', null)
    .in('status', ['Pending', 'Invoiced'])
    .or(
      // current year >= cutoff year → take all months of that year that match
      // building a single-shot filter for "year/month >= start AND year/month <= end"
      // is cleaner with a literal comparison once Postgres has the (year, month) tuple.
      // Two clauses connected by AND through .filter chains:
      [
        `and(year.eq.${year},month.gte.${month})`,
        ...rangeMonths(year, month, windowEnd.year, windowEnd.month).slice(1).map(
          (ym) => `and(year.eq.${ym.year},month.eq.${ym.month})`,
        ),
      ].join(','),
    )
    .order('year')
    .order('month')

  if (error) {
    return (
      <div className="p-6 max-w-5xl">
        <h2 className="text-lg font-bold text-[#191c1e] mb-2">Monthly Billing</h2>
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          Failed to load lesson months: {error.message}
        </div>
      </div>
    )
  }

  // Group by (year, month) for rendering. Only include rows whose
  // subscription is still active (no ended_at). The query already
  // filters by status, but the subscription itself may have been
  // ended after the row was generated.
  type Row = NonNullable<typeof months>[number]
  const rows: Row[] = (months ?? []).filter((m) => !m.lesson_subscription?.ended_at)

  // Group by year-month for display.
  const buckets = new Map<string, Row[]>()
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`
    const list = buckets.get(key)
    if (list) list.push(r)
    else buckets.set(key, [r])
  }

  // Build the visible months list (current + next 2) so empty months
  // still render an empty-state row, not just disappear.
  const visibleMonths = rangeMonths(year, month, windowEnd.year, windowEnd.month)

  type DisplayRow = {
    lessonMonthId:    string
    subscriptionId:   string
    riderName:        string
    billedToName:     string
    instructorName:   string
    slotLabel:        string
    subscriptionType: string
    lessonCount:      number
    perLessonPrice:   number
    total:            number | null
    status:           string
    isProrated:       boolean
  }

  function shapeRow(r: Row): DisplayRow {
    const sub = r.lesson_subscription
    return {
      lessonMonthId:    r.id,
      subscriptionId:   sub.id,
      riderName:        displayName(sub.rider),
      billedToName:     displayName(sub.billed_to),
      instructorName:   displayName(sub.instructor),
      slotLabel:        `${DAY_LABEL[sub.lesson_day] ?? sub.lesson_day} ${formatLessonTime(sub.lesson_time)}`,
      subscriptionType: sub.subscription_type,
      lessonCount:      r.lesson_count,
      perLessonPrice:   Number(r.per_lesson_price),
      total:            r.total != null ? Number(r.total) : null,
      status:           r.status,
      isProrated:       r.is_prorated,
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[#191c1e]">Monthly Billing</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Subscription lesson months for this month and the next two. Mark a slot as not continuing to clear its pending months. Send Invoices is coming in a follow-up — for now, route through the existing Invoices tab if you need to send before then.
        </p>
        <p className="text-[11px] text-[#444650] mt-2">
          <Link href="/chia/lessons-events/subscriptions/new" className="text-[#002058] font-semibold hover:underline">+ New subscription</Link>
        </p>
      </div>

      {visibleMonths.map((vm) => {
        const key  = `${vm.year}-${String(vm.month).padStart(2, '0')}`
        const list = buckets.get(key) ?? []

        // Compute Pending-only metrics for the Send Invoices button.
        // Recipient count is distinct billed-to people, since multiple
        // slots collapse into one invoice (ADR-0019).
        const pendingRows   = list.filter((r) => r.status === 'Pending')
        const pendingCount  = pendingRows.length
        const pendingTotal  = pendingRows.reduce((s, r) => s + Number(r.total ?? 0), 0)
        const recipientIds  = new Set(pendingRows.map((r) => r.lesson_subscription.billed_to_id))
        const recipientCount = recipientIds.size

        return (
          <section key={key} className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-[#191c1e]">
                {MONTH_LABEL[vm.month]} {vm.year}
                <span className="text-[11px] font-normal text-[#444650] ml-2">
                  {list.length} {list.length === 1 ? 'subscription' : 'subscriptions'}
                </span>
              </h3>
              <SendInvoicesButton
                year={vm.year}
                month={vm.month}
                pendingCount={pendingCount}
                pendingTotal={pendingTotal}
                recipientCount={recipientCount}
              />
            </div>
            <MonthlyBillingTable rows={list.map(shapeRow)} />
          </section>
        )
      })}
    </div>
  )
}

/** Year+month tuples from start (inclusive) through end (inclusive). */
function rangeMonths(
  startYear: number, startMonth: number,
  endYear:   number, endMonth:   number,
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = []
  let y = startYear, m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    out.push({ year: y, month: m })
    if (m === 12) { y += 1; m = 1 } else { m += 1 }
  }
  return out
}

/** "16:00:00" -> "4 PM" / "16:30:00" -> "4:30 PM" */
function formatLessonTime(time: string): string {
  const [h, mm] = time.split(':')
  const hour = Number.parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return mm === '00' ? `${h12} ${ampm}` : `${h12}:${mm} ${ampm}`
}
