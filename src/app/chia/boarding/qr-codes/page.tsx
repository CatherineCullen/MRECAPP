import { createAdminClient } from '@/lib/supabase/admin'
import { getAppOrigin } from '@/lib/appUrl'
import { displayName } from '@/lib/displayName'
import QrCodesClient, { type QrRow } from './_components/QrCodesClient'
import { type PersonOption, type ServiceOption } from './_components/NewProviderQrForm'
import { ensureTrainingRideProviderQrs } from './actions'

export default async function QrCodesPage() {
  const supabase = createAdminClient()
  const origin   = await getAppOrigin()

  await ensureTrainingRideProviderQrs()

  // Fetch services (both billable and provider services, but not Monthly Board —
  // Monthly Board never gets logged and never gets a QR code)
  // plus provider QR codes (with their person + service relations)
  // plus the pool of service-provider people for the new-code form.
  const [
    { data: services, error: svcErr },
    { data: providerQrs, error: pqrErr },
    { data: providerRoles, error: prErr },
    { data: trainingQrs, error: trErr },
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
    // Everyone with the service_provider role — candidate list for new codes.
    // Filter deleted_at on person_role (soft-delete leaves the row) and also
    // dedupe by person.id client-side — the partial unique index allows one
    // deleted row + one active row per person, which would otherwise produce
    // duplicate <option> entries and a React duplicate-key warning.
    supabase
      .from('person_role')
      .select(`
        person:person!person_role_person_id_fkey ( id, first_name, last_name, preferred_name, deleted_at )
      `)
      .eq('role', 'service_provider')
      .is('deleted_at', null),
    supabase
      .from('training_ride_provider_qr')
      .select(`
        id, token, is_active,
        person:person!training_ride_provider_qr_provider_person_id_fkey
          ( id, first_name, last_name, preferred_name, is_organization, organization_name, is_training_ride_provider )
      `)
      .order('is_active', { ascending: false })
      .order('created_at'),
  ])

  if (svcErr) throw svcErr
  if (pqrErr) throw pqrErr
  if (prErr)  throw prErr
  if (trErr)  throw trErr

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

  // Dedupe by person.id — defense in depth against a duplicate role grant
  // sneaking through. Also drops soft-deleted people (deleted_at not null).
  const providerMap = new Map<string, PersonOption>()
  for (const r of providerRoles ?? []) {
    const p = r.person
    if (!p || p.deleted_at) continue
    if (!providerMap.has(p.id)) {
      providerMap.set(p.id, { id: p.id, name: displayName(p) })
    }
  }
  const providers: PersonOption[] = Array.from(providerMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))

  const serviceOptions: ServiceOption[] = (services ?? [])
    .filter(s => s.is_active)
    .map(s => ({ id: s.id, name: s.name, is_billable: s.is_billable }))

  const trainingRows: QrRow[] = (trainingQrs ?? [])
    .filter(q => q.person?.is_training_ride_provider)
    .map(q => ({
      kind:      't',
      id:        q.id,
      primary:   displayName(q.person),
      secondary: 'Training Rides',
      url:       `${origin}/tr/${q.token}`,
      active:    q.is_active,
      canToggle: true,
    }))

  return (
    <QrCodesClient
      serviceRows={serviceRows}
      providerRows={providerRows}
      trainingRows={trainingRows}
      providers={providers}
      services={serviceOptions}
    />
  )
}
