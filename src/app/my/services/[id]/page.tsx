import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { recentHorsesForService } from '@/lib/boardServiceLogging'
import BoardServiceScanForm, { type HorseLite } from '@/components/BoardServiceScanForm'

export const metadata = { title: 'Log service — Marlboro Ridge Equestrian Center' }

export default async function MyLogServicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')
  if (!(user.isAdmin || user.isBarnWorker)) redirect('/my')

  const { id } = await params
  const db = createAdminClient()

  const { data: service } = await db
    .from('board_service')
    .select('id, name, is_billable, is_active, is_recurring_monthly')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!service)                     return <Invalid message="Service not found." />
  if (!service.is_active)           return <Invalid message={`${service.name} is currently deactivated.`} />
  if (service.is_recurring_monthly) return <Invalid message="Monthly Board is billed automatically and cannot be logged." />

  const [recent, { data: horseRows }] = await Promise.all([
    recentHorsesForService({ serviceId: id, days: 60 }),
    db.from('horse')
      .select('id, barn_name')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('barn_name'),
  ])

  const recentIds = new Set(recent.map(r => r.horseId))
  const allHorses: HorseLite[] = (horseRows ?? [])
    .filter(h => !!h.barn_name)
    .map(h => ({
      horseId:     h.id,
      name:        h.barn_name as string,
      recentCount: recentIds.has(h.id) ? recent.find(r => r.horseId === h.id)!.recentCount : 0,
    }))

  const loggerName =
    [user.preferredName ?? user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    || 'Staff'

  return (
    <BoardServiceScanForm
      heading={service.name}
      subheading={service.is_billable ? 'Billable' : 'Non-billable'}
      serviceId={service.id}
      loggedByLabel={loggerName}
      logSource="app"
      recentHorses={recent}
      allHorses={allHorses}
    />
  )
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
      <p className="text-sm font-semibold text-on-surface">Can&apos;t log this</p>
      <p className="text-xs text-on-surface-muted mt-1">{message}</p>
    </div>
  )
}
