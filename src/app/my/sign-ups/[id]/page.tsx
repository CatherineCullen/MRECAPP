import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { displayName } from '@/lib/displayName'
import { getRiderScope } from '../../_lib/riderScope'
import BoarderSheetView, { type BoarderSheetProps } from './_components/BoarderSheetView'

export default async function MySheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()
  const riderIds = await getRiderScope(user.personId)

  // Horses this user (or their minors) can sign up for this sheet — must be
  // a billing contact or have can_log_services. Server action re-checks, but
  // we filter the picker here for clarity.
  const { data: contacts } = await db
    .from('horse_contact')
    .select(`
      horse_id, is_billing_contact, can_log_services,
      horse:horse_id ( id, barn_name, status, deleted_at )
    `)
    .in('person_id', riderIds)
    .is('deleted_at', null)

  const myHorses = ((contacts ?? []) as any[])
    .filter(c => c.horse && !c.horse.deleted_at && c.horse.status === 'active')
    .filter(c => c.is_billing_contact || c.can_log_services)
    .map(c => ({ id: c.horse.id as string, barn_name: (c.horse.barn_name ?? 'Horse') as string }))
    // Dedupe — minors may double a horse.
    .filter((h, i, arr) => arr.findIndex(x => x.id === h.id) === i)
    .sort((a, b) => a.barn_name.localeCompare(b.barn_name))

  const myHorseIds = new Set(myHorses.map(h => h.id))

  const { data: sheet, error } = await db
    .from('sign_up_sheet')
    .select(`
      id, title, date, mode, description,
      provider:provider_person_id ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
      service:service_id ( id, name ),
      slots:sign_up_sheet_slot (
        id, position, start_time, duration_minutes, horse_id, signed_up_by_id, signed_up_at, notes,
        horse:horse_id ( id, barn_name ),
        signed_up_by:signed_up_by_id ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error)  throw error
  if (!sheet) notFound()

  const slots = ((sheet.slots as any[]) ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => ({
      id:                s.id,
      position:          s.position,
      start_time:        s.start_time,
      duration_minutes:  s.duration_minutes,
      horse_id:          s.horse_id,
      horse_name:        s.horse?.barn_name ?? null,
      signed_up_by_id:   s.signed_up_by_id,
      signed_up_by_name: s.signed_up_by ? displayName(s.signed_up_by) : null,
      notes:             s.notes,
      isMine:            !!s.horse_id && myHorseIds.has(s.horse_id),
    }))

  const props: BoarderSheetProps = {
    sheet: {
      id:           sheet.id,
      title:        sheet.title,
      date:         sheet.date,
      mode:         sheet.mode as 'timed' | 'ordered',
      description:  sheet.description,
      providerName: displayName(sheet.provider as any),
      serviceName:  (sheet.service as any)?.name ?? null,
    },
    slots,
    myHorses,
    isAdmin:    user.isAdmin,
    myPersonId: user.personId,
  }

  return (
    <div className="space-y-3">
      <Link href="/my/sign-ups" className="text-xs text-on-secondary-container">
        ← All sign-ups
      </Link>
      <BoarderSheetView {...props} />
    </div>
  )
}
