import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import MyNav from './_components/MyNav'
import { getRiderScope } from './_lib/riderScope'

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  if (!user.personId) redirect('/sign-in')

  const db = createAdminClient()
  const riderIds = await getRiderScope(user.personId)

  const [horsesRes, invoicesRes] = await Promise.all([
    db.from('horse_contact')
      .select('id')
      .in('person_id', riderIds)
      .is('deleted_at', null)
      .limit(1),
    db.from('invoice')
      .select('id')
      .in('billed_to_id', riderIds)
      .is('deleted_at', null)
      .limit(1),
  ])

  const hasHorses   = (horsesRes.data?.length   ?? 0) > 0
  const hasInvoices = (invoicesRes.data?.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-surface-low">
      <MyNav
        firstName={user.firstName ?? ''}
        hasHorses={hasHorses}
        hasInvoices={hasInvoices}
        isAdmin={user.isAdmin}
        canLogServices={user.isAdmin || user.isBarnWorker}
        canLogTrainingRides={user.isTrainingRideProvider || user.isAdmin}
      />
      <main className="max-w-md mx-auto px-4 py-4">
        {children}
      </main>
    </div>
  )
}
