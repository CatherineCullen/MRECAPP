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
    .select(`
      role,
      horse:horse!horse_id (
        id, barn_name, status,
        temporary_care_plan (
          id, description, is_active, deleted_at, ends_at
        )
      )
    `)
    .eq('person_id', user.personId)
    .is('deleted_at', null)

  const horses = (connections ?? [])
    .map(c => {
      const h = Array.isArray(c.horse) ? c.horse[0] : c.horse as any
      return h ? { ...h, role: c.role } : null
    })
    .filter(Boolean)
    .filter((h: any) => h.status !== 'inactive')

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
            const activePlans = (horse.temporary_care_plan ?? []).filter(
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
                    {activePlans[0].description}
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
