import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import SheetDetail, { type SheetDetailProps } from './_components/SheetDetail'

export default async function SheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: sheet, error: sheetErr }, { data: horses, error: hErr }] = await Promise.all([
    supabase
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
      .maybeSingle(),
    supabase
      .from('horse')
      .select('id, barn_name, status')
      .is('deleted_at', null)
      .order('barn_name'),
  ])

  if (sheetErr) throw sheetErr
  if (hErr)     throw hErr
  if (!sheet)   notFound()

  const slots = ((sheet.slots as any[]) ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => ({
      id:               s.id,
      position:         s.position,
      start_time:       s.start_time,
      duration_minutes: s.duration_minutes,
      horse_id:         s.horse_id,
      horse_name:       s.horse?.barn_name ?? null,
      signed_up_by:     s.signed_up_by ? {
        first_name:        s.signed_up_by.first_name,
        last_name:         s.signed_up_by.last_name,
        preferred_name:    s.signed_up_by.preferred_name,
        is_organization:   s.signed_up_by.is_organization,
        organization_name: s.signed_up_by.organization_name,
      } : null,
      signed_up_by_name: s.signed_up_by ? displayName(s.signed_up_by) : null,
      notes:             s.notes,
    }))

  const props: SheetDetailProps = {
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
    horses: ((horses as any[]) ?? []).map(h => ({
      id:        h.id,
      barn_name: h.barn_name ?? 'Unnamed horse',
      status:    h.status,
    })),
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link
        href="/chia/boarding/sheets"
        className="text-xs text-[#056380] hover:underline"
      >
        ← Back to sheets
      </Link>
      <SheetDetail {...props} />
    </div>
  )
}
