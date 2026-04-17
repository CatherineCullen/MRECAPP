import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import SubscriptionsTable, { type SubRow } from './_components/SubscriptionsTable'

export default async function SubscriptionsPage() {
  const supabase = createAdminClient()

  const { data: subs, error } = await supabase
    .from('lesson_subscription')
    .select(`
      id, lesson_day, lesson_time, subscription_price, subscription_type, status,
      is_prorated, prorated_lesson_count, prorated_price,
      rider:person!lesson_subscription_rider_id_fkey      ( id, first_name, last_name, preferred_name ),
      instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name, calendar_color ),
      horse:horse                                         ( id, barn_name ),
      quarter                                             ( id, label, start_date, end_date, is_active )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error

  type Sub = NonNullable<typeof subs>[number]
  const byQuarter = new Map<string, { label: string; is_active: boolean; start_date: string; subs: Sub[] }>()
  for (const s of subs ?? []) {
    const q = s.quarter
    if (!q) continue
    const key = q.id
    if (!byQuarter.has(key)) {
      byQuarter.set(key, { label: q.label, is_active: q.is_active, start_date: q.start_date, subs: [] })
    }
    byQuarter.get(key)!.subs.push(s)
  }
  const groups = Array.from(byQuarter.values()).sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return b.start_date.localeCompare(a.start_date)
  })

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
      subscription_price:    Number(s.subscription_price),
      is_prorated:           !!s.is_prorated,
      prorated_price:        s.prorated_price != null ? Number(s.prorated_price) : null,
      prorated_lesson_count: s.prorated_lesson_count ?? null,
      status:                s.status,
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
            ← Calendar
          </Link>
          <h2 className="text-sm font-bold text-[#191c1e] mt-1">Lesson Subscriptions</h2>
          <p className="text-xs text-[#444650] mt-0.5">Quarterly recurring weekly slots.</p>
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
          <p className="text-xs text-[#444650]">Click "+ New Subscription" to enroll the first rider.</p>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.label} className="mb-6">
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-xs font-bold text-[#191c1e] uppercase tracking-wide">{group.label}</h3>
              {group.is_active && (
                <span className="text-[10px] bg-[#002058] text-white px-1.5 py-0.5 rounded font-semibold">Active</span>
              )}
              <span className="text-xs text-[#444650]">{group.subs.length} {group.subs.length === 1 ? 'subscription' : 'subscriptions'}</span>
            </div>
            <SubscriptionsTable rows={group.subs.map(toRow)} />
          </div>
        ))
      )}
    </div>
  )
}
