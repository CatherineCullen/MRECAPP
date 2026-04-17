import { createAdminClient } from '@/lib/supabase/admin'
import { recentHorsesForService } from '@/lib/boardServiceLogging'
import BoardServiceScanForm, { type HorseLite } from '@/components/BoardServiceScanForm'

/**
 * Public per-service scan page — reached by barn workers scanning the
 * printed QR code for a particular a la carte service (e.g. "Wrapping").
 * No login required. The service UUID in the URL is unguessable enough to
 * act as its own access token for v1; we can tighten later if needed.
 */
export default async function ServiceScanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: service, error } = await supabase
    .from('board_service')
    .select('id, name, is_billable, is_active, is_recurring_monthly')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !service) return <Invalid message="This service code is not recognized." />
  if (!service.is_active)        return <Invalid message={`${service.name} is currently deactivated.`} />
  if (service.is_recurring_monthly) return <Invalid message="Monthly Board is billed automatically and cannot be logged." />

  // Recent horses (last 60 days of logs for this service) and a full horse
  // list for the "Add a horse" drawer. Only active horses appear.
  const [recent, { data: horseRows }] = await Promise.all([
    recentHorsesForService({ serviceId: id, days: 60 }),
    supabase
      .from('horse')
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

  return (
    <BoardServiceScanForm
      heading={service.name}
      subheading={service.is_billable ? 'Billable' : 'Non-billable'}
      serviceId={service.id}
      loggedByLabel={service.name}
      logSource="qr_code"
      recentHorses={recent}
      allHorses={allHorses}
    />
  )
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#f7f9fc] flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-8 max-w-md w-full text-center border border-[#c4c6d1]/40">
        <div className="text-4xl mb-3">⚠︎</div>
        <h1 className="text-lg font-bold text-[#191c1e] mb-1">Can't log this</h1>
        <p className="text-sm text-[#444650]">{message}</p>
      </div>
    </div>
  )
}
