import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import MyNav from './_components/MyNav'

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  if (!user.personId) redirect('/sign-in')

  const db = createAdminClient()

  const [horsesRes, invoicesRes] = await Promise.all([
    db.from('horse_contact')
      .select('id')
      .eq('person_id', user.personId)
      .is('deleted_at', null)
      .limit(1),
    db.from('invoice')
      .select('id')
      .eq('billed_to_id', user.personId)
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
      />
      <main className="max-w-md mx-auto px-4 py-4">
        {children}
      </main>
    </div>
  )
}
