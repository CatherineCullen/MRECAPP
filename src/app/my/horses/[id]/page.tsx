import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import HorseHeaderCard from './_components/HorseHeaderCard'
import CogginsCard from './_components/CogginsCard'
import MyCarePlansSection from './_components/MyCarePlansSection'
import MyHealthItemsSection from './_components/MyHealthItemsSection'
import MyServicesSection from './_components/MyServicesSection'
import MyDietSection from './_components/MyDietSection'
import MyDocumentsSection from './_components/MyDocumentsSection'
import { getRiderScope } from '../../_lib/riderScope'

export const metadata = { title: 'Horse — Marlboro Ridge Equestrian Center' }

export default async function MyHorsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()

  // Verify access (via rider scope so guardians see their minors' horses)
  const riderIds = await getRiderScope(user.personId)
  const { data: connection } = await db
    .from('horse_contact')
    .select('role')
    .eq('horse_id', id)
    .in('person_id', riderIds)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!connection && !user.isAdmin) notFound()

  const { data: horse } = await db
    .from('horse')
    .select('id, barn_name, registered_name, breed, color, gender, date_of_birth, height, weight, microchip, solo_turnout, notes, turnout_notes, ownership_notes, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!horse) notFound()

  const { data: recordingIds } = await db
    .from('horse_recording_ids')
    .select('usef_id, breed_recording_number, passport_number')
    .eq('horse_id', id)
    .maybeSingle()

  // Care plans — active + resolved, with person joins for "Added by" / "Resolved by"
  const { data: allCarePlans } = await db
    .from('care_plan')
    .select(`
      id, content, starts_on, ends_on, is_active, resolved_at, resolution_note, source_quote, created_at,
      person:person!care_plan_created_by_fkey (first_name, last_name),
      resolved_by_person:person!care_plan_resolved_by_fkey (first_name, last_name)
    `)
    .eq('horse_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const activeCarePlans   = (allCarePlans ?? []).filter((p: any) => p.is_active && !p.resolved_at)
  const resolvedCarePlans = (allCarePlans ?? []).filter((p: any) => p.resolved_at)

  // Latest coggins
  const { data: cogginsRows } = await db
    .from('coggins')
    .select('id, date_drawn, expiry_date, document_id')
    .eq('horse_id', id)
    .is('deleted_at', null)
    .order('date_drawn', { ascending: false })
    .limit(1)

  const latestCoggins = cogginsRows?.[0] ?? null

  // Latest diet record (supersession model — newest non-deleted row wins)
  const { data: dietRows } = await db
    .from('diet_record')
    .select('id, am_feed, am_supplements, am_hay, pm_feed, pm_supplements, pm_hay, notes, version, updated_at')
    .eq('horse_id', id)
    .is('deleted_at', null)
    .order('version', { ascending: false })
    .limit(1)

  const latestDiet = dietRows?.[0] ?? null

  // Documents linked to this horse (non-deleted). Coggins PDFs are also
  // stored as documents; surface them all in one place.
  const { data: documents } = await db
    .from('document')
    .select('id, document_type, filename, uploaded_at, signed_at, expires_at')
    .eq('horse_id', id)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  // Health program items (scheduled recurring health items per horse)
  const { data: healthItems } = await db
    .from('health_program_item')
    .select(`
      id, last_done, next_due,
      type:health_item_type!health_item_type_id ( id, name, is_essential, show_in_herd_dashboard )
    `)
    .eq('horse_id', id)
    .is('deleted_at', null)

  const healthItemsFiltered = (healthItems ?? [])
    .filter((i: any) => i.type?.name !== 'Coggins')

  const { data: catalog } = await db
    .from('health_item_type')
    .select('id, name, is_essential, show_in_herd_dashboard, is_active')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name', { ascending: true })

  const catalogFiltered = (catalog ?? []).filter((t: any) => t.name !== 'Coggins')

  // Services log — last 12 months. Includes logged board services + logged
  // training rides (lessons are excluded; they live on My Schedule). Rides
  // are billed via invoice line items downstream, so they have no inline
  // price here — just the activity.
  const svcCutoff = new Date(); svcCutoff.setMonth(svcCutoff.getMonth() - 12)
  const svcCutoffDate = svcCutoff.toISOString().slice(0, 10)

  const [{ data: serviceRows }, { data: rideRows }] = await Promise.all([
    db
      .from('board_service_log')
      .select(`
        id, logged_at, status, unit_price, is_billable, notes,
        service:service_id ( name )
      `)
      .eq('horse_id', id)
      .neq('status', 'voided')
      .gte('logged_at', svcCutoff.toISOString()),
    db
      .from('training_ride')
      .select(`
        id, ride_date, notes,
        provider:rider_id ( first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .eq('horse_id', id)
      .eq('status', 'logged')
      .is('deleted_at', null)
      .gte('ride_date', svcCutoffDate),
  ])

  const serviceEntries = [
    ...(serviceRows ?? []).map((r: any) => ({
      id:           `svc:${r.id}`,
      logged_at:    r.logged_at,
      unit_price:   r.unit_price,
      is_billable:  r.is_billable,
      notes:        r.notes,
      service_name: r.service?.name ?? 'Service',
    })),
    ...(rideRows ?? []).map((r: any) => {
      const p = r.provider
      const providerName = p?.is_organization
        ? (p.organization_name ?? 'Training provider')
        : [p?.preferred_name ?? p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Training provider'
      return {
        id:           `ride:${r.id}`,
        logged_at:    `${r.ride_date}T12:00:00.000Z`,
        unit_price:   null,
        is_billable:  true,
        notes:        r.notes,
        service_name: `Training ride — ${providerName}`,
      }
    }),
  ].sort((a, b) => (a.logged_at < b.logged_at ? 1 : a.logged_at > b.logged_at ? -1 : 0))

  return (
    <div className="space-y-3">
      {/* Back link */}
      <a href="/my/horses" className="text-xs font-semibold text-on-secondary-container">← All horses</a>

      <HorseHeaderCard horse={horse} recordingIds={recordingIds} role={connection?.role ?? null} />

      <CogginsCard horseId={id} coggins={latestCoggins} />

      <MyCarePlansSection
        horseId={id}
        activePlans={activeCarePlans as any}
        resolvedPlans={resolvedCarePlans as any}
      />

      <MyHealthItemsSection
        horseId={id}
        items={healthItemsFiltered as any}
        catalog={catalogFiltered as any}
      />

      <MyDietSection horseId={id} diet={latestDiet as any} />

      <MyServicesSection entries={serviceEntries} />

      <MyDocumentsSection documents={(documents ?? []) as any} />

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
