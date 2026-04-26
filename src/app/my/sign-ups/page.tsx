import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { displayName } from '@/lib/displayName'
import { getRiderScope } from '../_lib/riderScope'

export const metadata = { title: 'Sign-Ups — Marlboro Ridge Equestrian Center' }

export default async function MySignUpsPage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db    = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const riderIds = await getRiderScope(user.personId)

  // Horses this user (or a minor under them) is connected to. Used to mark
  // slots already claimed by "you" — drives the "Your slot" pill.
  const { data: horseLinks } = await db
    .from('horse_contact')
    .select('horse_id')
    .in('person_id', riderIds)
    .is('deleted_at', null)
  const myHorseIds = new Set((horseLinks ?? []).map(h => h.horse_id))

  const { data: sheets, error } = await db
    .from('sign_up_sheet')
    .select(`
      id, title, date, mode,
      provider:provider_person_id ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
      service:service_id ( id, name ),
      slots:sign_up_sheet_slot ( id, horse_id )
    `)
    .is('deleted_at', null)
    .gte('date', today)
    .order('date', { ascending: true })

  if (error) throw error

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-on-surface">Boarder Sign-Ups</h1>
        <p className="text-xs text-on-surface-muted mt-0.5">
          Add your horse to the list for visiting providers. Providers and boarders can see these lists.
        </p>
      </div>

      {(sheets ?? []).length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm font-semibold text-on-surface">No active sign-up sheets</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(sheets ?? []).map(s => {
            const slots  = (s.slots as any[]) ?? []
            const total  = slots.length
            const filled = slots.filter(x => x.horse_id).length
            const open   = total - filled
            const yours  = slots.filter(x => x.horse_id && myHorseIds.has(x.horse_id)).length
            const dt = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            return (
              <Link
                key={s.id}
                href={`/my/sign-ups/${s.id}`}
                className="block bg-surface-lowest rounded-lg px-4 py-3 hover:bg-surface-low transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-on-surface-muted">{dt}</div>
                    <div className="text-sm font-semibold text-on-surface truncate">{s.title}</div>
                    <div className="text-xs text-on-surface-muted truncate">
                      {displayName(s.provider as any)}
                      {s.service ? <span className="text-on-surface-muted/70"> · {(s.service as any).name}</span> : null}
                    </div>
                  </div>
                  <div className="text-right text-xs whitespace-nowrap">
                    {yours > 0 && (
                      <div className="text-on-secondary-container font-semibold mb-0.5">
                        Your slot{yours > 1 ? 's' : ''}: {yours}
                      </div>
                    )}
                    <div className="text-on-surface-muted">
                      {open > 0 ? `${open} open` : 'full'}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
