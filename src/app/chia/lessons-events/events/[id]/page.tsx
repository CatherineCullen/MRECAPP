import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EventDetail from './_components/EventDetail'
import { displayName } from '@/lib/displayName'

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: event, error }, { data: people }] = await Promise.all([
    supabase
      .from('event')
      .select(`
        id, scheduled_at, duration_minutes, title, notes, status, price,
        party_size, event_type_code, invoice_id, created_at,
        billing_skipped_at, billing_skipped_reason,
        type:event_type ( code, label, calendar_color, calendar_badge ),
        host:person!event_host_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
        instructor:person!event_instructor_id_fkey ( id, first_name, last_name, preferred_name ),
        invoice:invoice ( id, status, stripe_invoice_id )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name, is_organization, organization_name,
        person_role!person_role_person_id_fkey ( role, deleted_at )
      `)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
  ])

  if (error) throw error
  if (!event) notFound()

  const getRoles = (p: any): string[] =>
    (p.person_role ?? []).filter((r: any) => !r.deleted_at).map((r: any) => r.role)

  const instructorOptions = (people ?? [])
    .filter(p => getRoles(p).includes('instructor'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  const evtType = event.type as { label?: string; calendar_color?: string | null; calendar_badge?: string | null } | null
  const host      = event.host as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null } | null
  const instructor = event.instructor as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null } | null
  const invoice = event.invoice as { id: string; status: string; stripe_invoice_id: string | null } | null

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Calendar
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h2 className="text-lg font-bold text-[#191c1e]">Event</h2>
          {evtType?.calendar_badge && (
            <span
              className="text-[10px] font-bold text-white px-2 py-0.5 rounded"
              style={{ backgroundColor: evtType.calendar_color ?? '#8c8e98' }}
            >
              {evtType.calendar_badge}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
            event.status === 'cancelled' ? 'bg-[#ffd6d6] text-[#8a1a1a]' :
            event.status === 'completed' ? 'bg-[#b7f0d0] text-[#1a6b3c]' :
                                            'bg-[#dae2ff] text-[#002058]'
          }`}>
            {event.status}
          </span>
        </div>
      </div>

      <EventDetail
        eventId={event.id}
        eventTypeLabel={evtType?.label ?? 'Event'}
        scheduledAt={event.scheduled_at}
        durationMinutes={event.duration_minutes}
        title={event.title}
        notes={event.notes}
        status={event.status as 'scheduled' | 'completed' | 'cancelled'}
        price={Number(event.price)}
        partySize={event.party_size}
        instructorId={instructor?.id ?? null}
        instructorName={instructor ? displayName(instructor) : null}
        hostId={host?.id ?? ''}
        hostName={host ? displayName(host) : '—'}
        isBilled={Boolean(event.invoice_id)}
        invoiceId={invoice?.id ?? null}
        invoiceStatus={invoice?.status ?? null}
        stripeInvoiceId={invoice?.stripe_invoice_id ?? null}
        billingSkippedAt={event.billing_skipped_at}
        billingSkippedReason={event.billing_skipped_reason}
        instructorOptions={instructorOptions}
      />
    </div>
  )
}
