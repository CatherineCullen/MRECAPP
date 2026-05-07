import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import SubscriptionsTable, { type SubRow } from './_components/SubscriptionsTable'

export default async function SubscriptionsPage() {
  const supabase = createAdminClient()

  const { data: subs, error } = await supabase
    .from('lesson_subscription')
    .select(`
      id, lesson_day, lesson_time, subscription_type, status,
      rider:person!lesson_subscription_rider_id_fkey      ( id, first_name, last_name, preferred_name ),
      instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name, calendar_color ),
      horse:horse                                         ( id, barn_name )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error

  type Sub = NonNullable<typeof subs>[number]

  function toRow(s: Sub): SubRow {
    return {
      id:                    s.id,
      rider_id:              s.rider?.id ?? null,
      rider_name:            displayName(s.rider),
      instructor:            s.instructor
        ? {
            id:             s.instructor.id,
            first_name:     s.instructor.first_name,
            last_name:      s.instructor.last_name,
            preferred_name: s.instructor.preferred_name,
            calendar_color: s.instructor.calendar_color,
          }
        : null,
      instructor_name:       displayName(s.instructor),
      lesson_day:            s.lesson_day,
      lesson_time:           s.lesson_time,
      horse_name:            s.horse?.barn_name ?? null,
      subscription_type:     s.subscription_type,
      status:                s.status,
    }
  }

  // Group by status: active subs at the top, then pending, then the rest.
  // Under the monthly model there's no longer a natural time-axis grouping
  // (no quarters) — status is what admins actually filter by.
  const STATUS_ORDER: Record<string, number> = { active: 0, pending: 1, completed: 2, cancelled: 3 }
  const STATUS_LABEL: Record<string, string> = {
    active:    'Active',
    pending:   'Pending',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  const groupMap = new Map<string, Sub[]>()
  for (const s of subs ?? []) {
    if (!groupMap.has(s.status)) groupMap.set(s.status, [])
    groupMap.get(s.status)!.push(s)
  }
  const groups = Array.from(groupMap.entries())
    .sort((a, b) => (STATUS_ORDER[a[0]] ?? 99) - (STATUS_ORDER[b[0]] ?? 99))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
            ← Calendar
          </Link>
          <h2 className="text-sm font-bold text-[#191c1e] mt-1">Lesson Subscriptions</h2>
          <p className="text-xs text-[#444650] mt-0.5">Recurring weekly slots. Pricing is catalog-driven and snapshotted onto each month at billing time.</p>
        </div>
        <Link
          href="/chia/lessons-events/subscriptions/new"
          className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors"
        >
          + New Subscription
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-lg px-4 py-8 text-center max-w-md">
          <p className="text-sm font-semibold text-[#191c1e] mb-1">No subscriptions yet</p>
          <p className="text-xs text-[#444650]">Click &ldquo;+ New Subscription&rdquo; to enroll the first rider.</p>
        </div>
      ) : (
        groups.map(([status, items]) => (
          <div key={status} className="mb-6">
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-xs font-bold text-[#191c1e] uppercase tracking-wide">
                {STATUS_LABEL[status] ?? status}
              </h3>
              <span className="text-xs text-[#444650]">
                {items.length} {items.length === 1 ? 'subscription' : 'subscriptions'}
              </span>
            </div>
            <SubscriptionsTable rows={items.map(toRow)} />
          </div>
        ))
      )}
    </div>
  )
}
