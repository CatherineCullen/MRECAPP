import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import MyCogginsForm from './_components/MyCogginsForm'
import { getRiderScope } from '../../../../_lib/riderScope'

export const metadata = { title: 'Add Coggins — Marlboro Ridge Equestrian Center' }

export default async function AddCogginsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()

  const riderIds = await getRiderScope(user.personId)
  const { data: connection } = await db
    .from('horse_contact')
    .select('id')
    .eq('horse_id', id)
    .in('person_id', riderIds)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!connection && !user.isAdmin) notFound()

  const { data: horse } = await db
    .from('horse')
    .select('barn_name')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!horse) notFound()

  return <MyCogginsForm horseId={id} horseName={horse.barn_name} />
}
