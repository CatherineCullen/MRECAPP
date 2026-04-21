import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'

export const metadata = { title: 'Horse — Marlboro Ridge' }

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function MyHorsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()

  // Verify access
  const { data: connection } = await db
    .from('horse_contact')
    .select('role')
    .eq('horse_id', id)
    .eq('person_id', user.personId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!connection && !user.isAdmin) notFound()

  const { data: horse } = await db
    .from('horse')
    .select('id, barn_name, registered_name, breed, color, gender, notes, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!horse) notFound()

  // Active care plans
  const { data: carePlans } = await db
    .from('care_plan')
    .select('id, content, is_active, deleted_at, ends_on, created_at')
    .eq('horse_id', id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Latest coggins
  const { data: cogginsRows } = await db
    .from('coggins')
    .select('id, date_drawn, expiry_date')
    .eq('horse_id', id)
    .is('deleted_at', null)
    .order('date_drawn', { ascending: false })
    .limit(1)

  const latestCoggins = cogginsRows?.[0] ?? null

  // Upcoming essential health events
  const { data: healthEvents } = await db
    .from('health_event')
    .select(`
      id, next_due, administered_on,
      health_item_type!health_item_type_id ( name, is_essential )
    `)
    .eq('horse_id', id)
    .is('deleted_at', null)
    .not('next_due', 'is', null)
    .order('next_due', { ascending: true })

  const today = new Date().toISOString().slice(0, 10)

  const essentialItems = (healthEvents ?? [])
    .filter((e: any) => (e.health_item_type as any)?.is_essential)

  return (
    <div className="space-y-3">
      {/* Back link */}
      <a href="/my/horses" className="text-xs font-semibold text-on-secondary-container">← All horses</a>

      {/* Header */}
      <div className="bg-surface-lowest rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-on-surface">{horse.barn_name}</h1>
          {connection?.role && (
            <span className="text-[10px] font-semibold bg-primary-fixed text-primary px-1.5 py-0.5 rounded uppercase tracking-wide">
              {connection.role}
            </span>
          )}
        </div>
        {horse.registered_name && horse.registered_name !== horse.barn_name && (
          <p className="text-sm text-on-surface-muted mt-0.5">{horse.registered_name}</p>
        )}
        {(horse.breed || horse.color || horse.gender) && (
          <p className="text-sm text-on-surface-muted mt-0.5">
            {[horse.breed, horse.color, horse.gender].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Active care plans */}
      {(carePlans?.length ?? 0) > 0 && (
        <div className="bg-surface-lowest rounded-lg px-4 py-3">
          <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2">
            Active Care Plans
          </h2>
          <div className="space-y-2">
            {(carePlans ?? []).map((plan: any) => (
              <div key={plan.id}>
                <p className="text-sm font-semibold text-on-surface">{plan.content}</p>
                {plan.ends_on && (
                  <p className="text-xs text-on-surface-muted mt-0.5">Until {formatDate(plan.ends_on)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health summary */}
      {(latestCoggins || essentialItems.length > 0) && (
        <div className="bg-surface-lowest rounded-lg px-4 py-3">
          <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2">
            Health
          </h2>
          <div className="space-y-1.5">
            {latestCoggins && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface">Coggins</span>
                <span className={`text-xs font-semibold ${
                  latestCoggins.expiry_date && latestCoggins.expiry_date < today
                    ? 'text-error'
                    : 'text-on-surface-muted'
                }`}>
                  {latestCoggins.expiry_date
                    ? `Expires ${formatDate(latestCoggins.expiry_date)}`
                    : `Drawn ${formatDate(latestCoggins.date_drawn)}`}
                </span>
              </div>
            )}
            {essentialItems.map((item: any) => {
              const isOverdue = item.next_due < today
              return (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-sm text-on-surface">{(item.health_item_type as any)?.name}</span>
                  <span className={`text-xs font-semibold ${isOverdue ? 'text-error' : 'text-on-surface-muted'}`}>
                    Due {formatDate(item.next_due)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      {horse.notes && (
        <div className="bg-surface-lowest rounded-lg px-4 py-3">
          <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">Notes</h2>
          <p className="text-sm text-on-surface whitespace-pre-wrap">{horse.notes}</p>
        </div>
      )}
    </div>
  )
}
