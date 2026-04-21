import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = { title: 'Services — Marlboro Ridge Equestrian Center' }

export default async function MyServicesPage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')
  if (!(user.isAdmin || user.isBarnWorker)) redirect('/my')

  const db = createAdminClient()
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: services }, { data: myLogs }] = await Promise.all([
    db.from('board_service')
      .select('id, name, is_billable, is_recurring_monthly')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name'),
    db.from('board_service_log')
      .select('service_id')
      .eq('logged_by_id', user.personId)
      .gte('logged_at', since)
      .neq('status', 'voided'),
  ])

  // Recent count per service for *this logger*
  const myCounts = new Map<string, number>()
  for (const r of myLogs ?? []) {
    myCounts.set(r.service_id, (myCounts.get(r.service_id) ?? 0) + 1)
  }

  // Filter out monthly board (billed automatically)
  const loggable = (services ?? []).filter(s => !s.is_recurring_monthly)

  // Sort: recent count desc, then name
  const sorted = [...loggable].sort((a, b) => {
    const ca = myCounts.get(a.id) ?? 0
    const cb = myCounts.get(b.id) ?? 0
    if (cb !== ca) return cb - ca
    return a.name.localeCompare(b.name)
  })

  const billable    = sorted.filter(s => s.is_billable)
  const nonBillable = sorted.filter(s => !s.is_billable)

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">
        Log a service
      </h1>

      {sorted.length === 0 && (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-on-surface">No services available to log.</p>
        </div>
      )}

      {billable.length > 0 && (
        <Section title="Billable" services={billable} myCounts={myCounts} />
      )}
      {nonBillable.length > 0 && (
        <Section title="Non-billable" services={nonBillable} myCounts={myCounts} />
      )}
    </div>
  )
}

function Section({
  title, services, myCounts,
}: {
  title: string
  services: { id: string; name: string }[]
  myCounts: Map<string, number>
}) {
  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-4 pt-3 pb-2">
        {title}
      </h2>
      <ul>
        {services.map(s => {
          const n = myCounts.get(s.id) ?? 0
          return (
            <li key={s.id}>
              <Link
                href={`/my/services/${s.id}`}
                className="flex items-center justify-between px-4 py-3 border-t border-outline/20 first:border-t-0 hover:bg-surface-low"
              >
                <span className="text-sm font-semibold text-on-surface">{s.name}</span>
                {n > 0 && (
                  <span className="text-[10px] font-semibold text-on-surface-muted bg-surface-low px-1.5 py-0.5 rounded">
                    {n}× recent
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
