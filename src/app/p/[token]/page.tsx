import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import { recentHorsesForService } from '@/lib/boardServiceLogging'
import BoardServiceScanForm, { type HorseLite } from '@/components/BoardServiceScanForm'

/**
 * Public per-provider scan page — reached by external service providers
 * (farrier, vet, body worker) scanning their personal printed QR code.
 * The token on the URL is the random one minted in provider_qr_code.token.
 * One provider QR is bound to exactly one service.
 */
export default async function ProviderScanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: pqr, error } = await supabase
    .from('provider_qr_code')
    .select(`
      id, is_active,
      person:person!provider_qr_code_provider_person_id_fkey ( id, first_name, last_name, preferred_name, organization_name, is_organization ),
      service:board_service!provider_qr_code_service_id_fkey ( id, name, is_billable, is_active, is_recurring_monthly, deleted_at )
    `)
    .eq('token', token)
    .maybeSingle()

  if (error || !pqr)      return <Invalid message="This provider code is not recognized." />
  if (!pqr.is_active)     return <Invalid message="This provider code has been deactivated." />
  if (!pqr.service)       return <Invalid message="Service is missing for this provider code." />
  if (pqr.service.deleted_at)        return <Invalid message="Service has been removed." />
  if (!pqr.service.is_active)        return <Invalid message={`${pqr.service.name} is currently deactivated.`} />
  if (pqr.service.is_recurring_monthly) return <Invalid message="Monthly Board is billed automatically and cannot be logged." />

  const providerLabel = displayName(pqr.person)

  // Recent horses filtered to this provider+service pair so farriers see
  // only the horses they've actually worked on, not every horse in the barn.
  const [recent, { data: horseRows }] = await Promise.all([
    recentHorsesForService({
      serviceId:        pqr.service.id,
      days:             60,
      providerQrCodeId: pqr.id,
    }),
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
      heading={providerLabel}
      subheading={pqr.service.name}
      serviceId={pqr.service.id}
      loggedByLabel={providerLabel}
      providerQrCodeId={pqr.id}
      logSource="qr_code"
      recentHorses={recent}
      allHorses={allHorses}
      confirmationCopy={`Logged ${pqr.service.name} by ${providerLabel} for the selected horses.`}
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
