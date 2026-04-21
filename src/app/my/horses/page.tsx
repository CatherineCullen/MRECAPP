import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = { title: 'Horses — Marlboro Ridge' }

export default async function MyHorsesPage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()

  const { data: connections } = await db
    .from('horse_contact')
    .select('horse_id, role')
    .eq('person_id', user.personId)
    .is('deleted_at', null)

  const horseIds = (connections ?? []).map(c => c.horse_id)

  const { data: horseRows } = horseIds.length > 0
    ? await db
        .from('horse')
        .select(`
          id, barn_name, status,
          care_plan ( id, content, is_active, deleted_at )
        `)
        .in('id', horseIds)
        .is('deleted_at', null)
        .neq('status', 'archived')
    : { data: [] }

  const roleMap = new Map((connections ?? []).map(c => [c.horse_id, c.role]))
  const horses = (horseRows ?? []).map(h => ({ ...h, role: roleMap.get(h.id) }))

  if (horses.length === 1) {
    redirect(`/my/horses/${horses[0].id}`)
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">
        Horses
      </h1>

      {horses.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm font-semibold text-on-surface">No horses linked to your account</p>
        </div>
      ) : (
        <div className="space-y-2">
          {horses.map((horse: any) => {
            const activePlans = ((horse as any).care_plan ?? []).filter(
              (p: any) => p.is_active && !p.deleted_at
            )
            return (
              <Link
                key={horse.id}
                href={`/my/horses/${horse.id}`}
                className="block bg-surface-lowest rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-bold text-on-surface">{horse.barn_name}</p>
                  {horse.role && (
                    <span className="text-[10px] font-semibold bg-primary-fixed text-primary px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                      {horse.role}
                    </span>
                  )}
                </div>
                {activePlans[0] && (
                  <p className="text-sm text-on-surface-muted mt-0.5 truncate">
                    {activePlans[0].content}
                    {activePlans.length > 1 && ` +${activePlans.length - 1} more`}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
