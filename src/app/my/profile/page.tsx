import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './_components/ProfileForm'

export const metadata = { title: 'Profile — Marlboro Ridge' }

export default async function MyProfilePage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()
  const { data: person } = await db
    .from('person')
    .select('first_name, last_name, email, phone, address, emergency_contact_name, emergency_contact_phone')
    .eq('id', user.personId)
    .maybeSingle()

  if (!person) redirect('/sign-in')

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">Profile</h1>
      <ProfileForm person={person} />
    </div>
  )
}
