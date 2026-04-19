import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import HorseIdentitySection from './_components/HorseIdentitySection'
import HorseCarePlansSection from './_components/HorseCarePlansSection'
import HorseDietSection from './_components/HorseDietSection'
import HorseCogginsSection from './_components/HorseCogginsSection'
import HorseContactsSection from './_components/HorseContactsSection'
import HorseVetVisitsSection from './_components/HorseVetVisitsSection'
import HorseBoardServicesSection, { type HorseBoardLog, type BoardServiceOption } from './_components/HorseBoardServicesSection'
import EntityDocumentsSection from '@/app/chia/documents/_components/EntityDocumentsSection'
import { getCurrentUser } from '@/lib/auth'
import { displayName } from '@/lib/displayName'

export default async function HorseRecordPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  // Auto-resolve any care plans whose end date has passed
  const today = new Date().toISOString().split('T')[0]
  await supabase
    .from('care_plan')
    .update({ is_active: false, resolved_at: new Date().toISOString(), resolution_note: 'Automatically resolved — end date passed.' })
    .eq('horse_id', id)
    .eq('is_active', true)
    .not('ends_on', 'is', null)
    .lt('ends_on', today)
    .is('deleted_at', null)

  const { data: horse, error } = await supabase
    .from('horse')
    .select(`
      *,
      horse_recording_ids (*),
      diet_record!diet_record_horse_id_fkey (
        id, am_feed, am_supplements, am_hay, pm_feed, pm_supplements, pm_hay, notes, version, created_at, updated_at, deleted_at
      ),
      coggins (
        id, date_drawn, expiry_date, vet_name, document_id, created_at
      ),
      care_plan (
        id, content, starts_on, ends_on, is_active, created_at, updated_at,
        resolved_at, resolution_note, source_quote,
        person!care_plan_created_by_fkey (first_name, last_name),
        resolved_by_person:person!care_plan_resolved_by_fkey (first_name, last_name)
      ),
      horse_contact (
        id, role, can_log_in, is_billing_contact, receives_health_alerts, receives_lesson_notifications,
        person!horse_contact_person_id_fkey (id, first_name, last_name, email, phone)
      ),
      vet_visit (
        id, visit_date, vet_name, findings,
        document:imported_from_document_id (id, filename)
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!horse) notFound()

  // Board service logs for this horse (last 25, any status) plus the active
  // service catalog for the Add-log dropdown. Board service logs live in
  // their own table so we fetch separately rather than nesting in the horse
  // query (that query is already heavy).
  const [
    { data: boardLogs },
    { data: boardServices },
    currentUser,
  ] = await Promise.all([
    supabase
      .from('board_service_log')
      .select(`
        id, logged_at, logged_by_label, log_source, unit_price, is_billable, notes, status,
        void_reason, voided_at,
        service:board_service!board_service_log_service_id_fkey ( id, name )
      `)
      .eq('horse_id', id)
      .order('logged_at', { ascending: false })
      .limit(25),
    supabase
      .from('board_service')
      .select('id, name, is_billable')
      .is('deleted_at', null)
      .eq('is_active', true)
      .eq('is_recurring_monthly', false)
      .order('name'),
    getCurrentUser(),
  ])

  const logs: HorseBoardLog[] = (boardLogs ?? []) as HorseBoardLog[]
  const serviceOptions: BoardServiceOption[] = (boardServices ?? []) as BoardServiceOption[]
  const userName = currentUser
    ? displayName({
        first_name:       currentUser.firstName,
        last_name:        currentUser.lastName,
        preferred_name:   null,
        organization_name:null,
        is_organization:  false,
      })
    : 'Admin'

  // Pull only the active diet record and active care plans
  const activeDiet = (horse.diet_record as any[])?.find((d: any) => !d.deleted_at) ?? null
  const activeCoggins = (horse.coggins as any[])
    ?.filter((c: any) => !c.deleted_at)
    .sort((a: any, b: any) => new Date(b.date_drawn).getTime() - new Date(a.date_drawn).getTime())[0] ?? null
  const activeCarePlans = (horse.care_plan as any[])
    ?.filter((p: any) => p.is_active && !p.deleted_at && !p.resolved_at) ?? []
  const resolvedCarePlans = (horse.care_plan as any[])
    ?.filter((p: any) => !p.is_active && !p.deleted_at && p.resolved_at)
    .sort((a: any, b: any) => new Date(b.resolved_at).getTime() - new Date(a.resolved_at).getTime()) ?? []
  const contacts = (horse.horse_contact as any[])
    ?.filter((c: any) => !c.deleted_at) ?? []
  const vetVisits = (horse.vet_visit as any[])
    ?.filter((v: any) => !v.deleted_at)
    .sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime()) ?? []

  const STATUS_COLORS: Record<string, string> = {
    active:   'bg-[#b7f0d0] text-[#1a6b3c]',
    pending:  'bg-[#ffddb3] text-[#7c4b00]',
    away:     'bg-[#e0e3e6] text-[#444650]',
    archived: 'bg-[#e0e3e6] text-[#444650]',
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">
            Horses
          </Link>
          <span className="text-[#c4c6d1]">/</span>
          <span className="text-[#191c1e] font-semibold">{horse.barn_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded capitalize ${STATUS_COLORS[horse.status]}`}>
            {horse.status}
          </span>
          <Link
            href={`/chia/herd/horses/${id}/edit`}
            className="text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-3 py-1.5 rounded transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {/* Identity */}
        <HorseIdentitySection horse={horse} recordingIds={horse.horse_recording_ids} />

        {/* Coggins */}
        <HorseCogginsSection coggins={activeCoggins} horseId={id} />

        {/* Daily Care — Care Plans + Diet */}
        <section className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-[#f2f4f7]">
            <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Daily Care</h2>
          </div>
          <HorseCarePlansSection plans={activeCarePlans} resolvedPlans={resolvedCarePlans} horseId={id} />
          <HorseDietSection diet={activeDiet} horseId={id} />
        </section>

        {/* Contacts */}
        <HorseContactsSection contacts={contacts} horseId={id} />

        {/* Board Services — visibility only, no reconciliation */}
        <HorseBoardServicesSection
          horseId={id}
          horseName={horse.barn_name}
          logs={logs}
          services={serviceOptions}
          currentUserName={userName}
        />

        {/* Vet Records */}
        {vetVisits.length > 0 && <HorseVetVisitsSection visits={vetVisits} />}

        {/* Documents — Coggins PDFs, vet attachments, vaccine certs, misc */}
        <EntityDocumentsSection kind="horse" id={id} label={`Horse: ${horse.barn_name}`} />
      </div>
    </div>
  )
}
