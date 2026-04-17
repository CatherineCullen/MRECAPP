import { createAdminClient } from '@/lib/supabase/admin'
import { getAppOrigin } from '@/lib/appUrl'
import { displayName } from '@/lib/displayName'
import QrCodesClient, { type QrRow } from './_components/QrCodesClient'
import { type PersonOption, type ServiceOption } from './_components/NewProviderQrForm'

export default async function QrCodesPage() {
  const supabase = createAdminClient()
  const origin   = await getAppOrigin()

  // Fetch services (both billable and provider services, but not Monthly Board —
  // Monthly Board never gets logged and never gets a QR code)
  // plus provider QR codes (with their person + service relations)
  // plus the pool of service-provider people for the new-code form.
  const [
    { data: services, error: svcErr },
    { data: providerQrs, error: pqrErr },
    { data: providerRoles, error: prErr },
  ] = await Promise.all([
    supabase
      .from('board_service')
      .select('id, name, is_billable, is_recurring_monthly, is_active')
      .is('deleted_at', null)
      .eq('is_recurring_monthly', false)
      .order('is_active', { ascending: false })
      .order('name'),
    supabase
      .from('provider_qr_code')
      .select(`
        id, token, is_active,
        person:person!provider_qr_code_provider_person_id_fkey ( id, first_name, last_name, preferred_name ),
        service:board_service!provider_qr_code_service_id_fkey ( id, name, is_billable )
      `)
      .order('is_active', { ascending: false })
      .order('created_at'),
    // Everyone with the service_provider role — candidate list for new codes
    supabase
      .from('person_role')
      .select(`
        person:person!person_role_person_id_fkey ( id, first_name, last_name, preferred_name )
      `)
      .eq('role', 'service_provider'),
  ])

  if (svcErr) throw svcErr
  if (pqrErr) throw pqrErr
  if (prErr)  throw prErr

  // Build rows for the per-service table. Service IDs are UUIDs so they're fine
  // to use directly in the scan URL — no additional token needed.
  const serviceRows: QrRow[] = (services ?? []).map(s => ({
    kind:      's',
    id:        s.id,
    primary:   s.name,
    secondary: s.is_billable ? 'Billable' : 'Non-billable',
    url:       `${origin}/s/${s.id}`,
    active:    s.is_active,
    canToggle: false,
  }))

  const providerRows: QrRow[] = (providerQrs ?? []).map(q => ({
    kind:      'p',
    id:        q.id,
    primary:   displayName(q.person),
    secondary: q.service?.name ?? null,
    url:       `${origin}/p/${q.token}`,
    active:    q.is_active,
    canToggle: true,
  }))

  const providers: PersonOption[] = (providerRoles ?? [])
    .map(r => r.person)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map(p => ({ id: p.id, name: displayName(p) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const serviceOptions: ServiceOption[] = (services ?? [])
    .filter(s => s.is_active)
    .map(s => ({ id: s.id, name: s.name, is_billable: s.is_billable }))

  return (
    <QrCodesClient
      serviceRows={serviceRows}
      providerRows={providerRows}
      providers={providers}
      services={serviceOptions}
    />
  )
}
