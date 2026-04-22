import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PersonRolesSection from './_components/PersonRolesSection'
import PersonHorsesSection from './_components/PersonHorsesSection'
import PersonGuardianSection from './_components/PersonGuardianSection'
import PersonStripeSection from './_components/PersonStripeSection'
import EntityDocumentsSection from '@/app/chia/documents/_components/EntityDocumentsSection'
import { getCurrentUser } from '@/lib/auth'
import SendInviteButton from './_components/SendInviteButton'
import ChangeLoginEmailButton from './_components/ChangeLoginEmailButton'
import ArchivePersonButton from './_components/ArchivePersonButton'

const ROLE_LABELS: Record<string, string> = {
  rider: 'Rider', owner: 'Owner', instructor: 'Instructor',
  admin: 'Admin', barn_owner: 'Barn Owner', barn_worker: 'Barn Worker',
  service_provider: 'Service Provider',
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()
  const currentUser = await getCurrentUser()

  const { data: person, error } = await supabase
    .from('person')
    .select(`
      *,
      person_role!person_role_person_id_fkey ( id, role, deleted_at ),
      horse_contact (
        id, role, is_billing_contact, receives_health_alerts, can_log_in,
        horse ( id, barn_name, status )
      ),
      guardian:guardian_id ( id, first_name, last_name, email, phone )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!person) notFound()

  // Phase B: fetch invoices for this person (admin-only section below).
  // Only query when the viewer is admin — no point paying for the query
  // on pages where we won't render it.
  let invoices: Array<{
    id: string
    status: string
    stripe_invoice_id: string | null
    sent_at: string | null
    paid_at: string | null
    due_date: string | null
    notes: string | null
    total: number
  }> = []
  if (currentUser?.isAdmin) {
    const { data: invoiceRows } = await supabase
      .from('invoice')
      .select(`
        id, status, stripe_invoice_id, sent_at, paid_at, due_date, notes,
        invoice_line_item ( total )
      `)
      .eq('billed_to_id', id)
      .is('deleted_at', null)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(20)

    invoices = (invoiceRows ?? []).map((inv) => ({
      id: inv.id,
      status: inv.status,
      stripe_invoice_id: inv.stripe_invoice_id,
      sent_at: inv.sent_at,
      paid_at: inv.paid_at,
      due_date: inv.due_date,
      notes: inv.notes,
      total: (inv.invoice_line_item ?? []).reduce(
        (sum: number, li: { total: number | null }) => sum + Number(li.total ?? 0),
        0
      ),
    }))
  }

  // Fetch minors if this person is a guardian
  const { data: minors } = await supabase
    .from('person')
    .select('id, first_name, last_name')
    .eq('guardian_id', id)
    .is('deleted_at', null)
    .order('first_name')

  const roles      = (person.person_role ?? [])
    .filter((r: any) => !r.deleted_at)
    .map((r: any) => r.role as string)
  const horseLinks = (person.horse_contact ?? []).filter((hc: any) => hc.horse && !hc.horse.deleted_at)
  const guardian   = person.guardian as any
  const displayName = person.is_organization
    ? person.organization_name
    : [person.first_name, person.last_name].filter(Boolean).join(' ')

  const dob = person.date_of_birth
    ? new Date(person.date_of_birth + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="p-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/people" className="text-[#056380] hover:text-[#002058]">People</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">{displayName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-[#191c1e]">{displayName}</h1>
          {person.preferred_name && (
            <div className="text-sm text-[#444650]">Goes by "{person.preferred_name}"</div>
          )}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {person.is_minor && (
              <span className="text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider">Minor</span>
            )}
            {person.is_organization && (
              <span className="text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider">Organization</span>
            )}
            {person.is_training_ride_provider && (
              <span className="text-[10px] font-semibold bg-[#ffddb3] text-[#7c4b00] px-1.5 py-0.5 rounded uppercase tracking-wider">TR Provider</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!person.auth_user_id && !person.is_minor && !person.is_organization && (
            <SendInviteButton personId={id} hasEmail={!!person.email} />
          )}
          {person.auth_user_id && currentUser?.isAdmin && (
            <ChangeLoginEmailButton personId={id} currentEmail={person.email} />
          )}
          <Link
            href={`/chia/people/${id}/edit`}
            className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
          >
            Edit
          </Link>
          {currentUser?.isAdmin && <ArchivePersonButton personId={id} />}
        </div>
      </div>

      <div className="space-y-3">
        {/* Contact info — hidden entirely when every field is empty */}
        {(person.email || person.phone || person.address || dob || (person.preferred_language && person.preferred_language !== 'english')) && (
          <section className="bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-[#f2f4f7]">
              <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Contact</h2>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {person.email && (
                <div>
                  <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Email</div>
                  <a href={`mailto:${person.email}`} className="text-[#191c1e] hover:text-[#002058]">{person.email}</a>
                </div>
              )}
              {person.phone && (
                <div>
                  <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Phone</div>
                  <a href={`tel:${person.phone}`} className="text-[#191c1e]">{person.phone}</a>
                </div>
              )}
              {person.address && (
                <div className="col-span-2">
                  <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Address</div>
                  <div className="text-[#191c1e] whitespace-pre-wrap">{person.address}</div>
                </div>
              )}
              {dob && (
                <div>
                  <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Date of Birth</div>
                  <div className="text-[#191c1e]">{dob}</div>
                </div>
              )}
              {person.preferred_language && person.preferred_language !== 'english' && (
                <div>
                  <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Preferred Language</div>
                  <div className="text-[#191c1e] capitalize">{person.preferred_language}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Roles */}
        <PersonRolesSection personId={id} roles={roles} />

        {/* Admin-only fields — hidden for organizations, and when every field is empty */}
        {!person.is_organization && (
          person.riding_level || person.weight_category || person.height || person.usef_id || person.provider_type || person.notes
        ) && (
          <section className="bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-[#f2f4f7]">
              <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Admin Notes</h2>
            </div>
            {(person.riding_level || person.weight_category || person.height || person.usef_id || person.provider_type) && (
              <div className="px-4 py-3 grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {person.riding_level && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Riding Level</div>
                    <div className="text-[#191c1e] capitalize">{person.riding_level}</div>
                  </div>
                )}
                {person.weight_category && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Weight Category</div>
                    <div className="text-[#191c1e] capitalize">{person.weight_category}</div>
                  </div>
                )}
                {person.height && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Height</div>
                    <div className="text-[#191c1e]">{person.height}</div>
                  </div>
                )}
                {person.usef_id && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">USEF ID</div>
                    <div className="text-[#191c1e]">{person.usef_id}</div>
                  </div>
                )}
                {person.provider_type && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Provider Type</div>
                    <div className="text-[#191c1e]">{person.provider_type}</div>
                  </div>
                )}
              </div>
            )}
            {person.notes && (
              <div className="px-4 pb-3 pt-3">
                <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Notes</div>
                <div className="text-sm text-[#191c1e] whitespace-pre-wrap">{person.notes}</div>
              </div>
            )}
          </section>
        )}

        {/* Guardian / Minors */}
        <PersonGuardianSection
          person={person}
          guardian={guardian}
          minors={minors ?? []}
        />

        {/* Horse connections */}
        <PersonHorsesSection horseLinks={horseLinks} personId={id} />

        {/* Documents — waivers, boarding agreements, misc attached to this person */}
        <EntityDocumentsSection kind="person" id={id} label={`Person: ${displayName}`} />

        {/* Stripe sync — admin-only. Stripe customer IDs are billing
            plumbing, not something end users should see or trigger.
            Hidden for minors: CHIA never bills minors directly — billing
            routes through the guardian by policy. */}
        {currentUser?.isAdmin && !person.is_minor && (
          <PersonStripeSection
            personId={id}
            initialStripeCustomerId={person.stripe_customer_id ?? null}
            invoices={invoices}
          />
        )}
      </div>
    </div>
  )
}
