import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './_components/ProfileForm'
import NotificationPrefsSection from './_components/NotificationPrefsSection'

export const metadata = { title: 'Profile — Marlboro Ridge' }

export default async function MyProfilePage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()

  const [personRes, prefsRes] = await Promise.all([
    db.from('person')
      .select('first_name, last_name, email, phone, address, emergency_contact_name, emergency_contact_phone')
      .eq('id', user.personId)
      .maybeSingle(),
    db.from('notification_preference')
      .select('notification_type, channel, opted_out')
      .eq('person_id', user.personId)
      .is('deleted_at', null),
  ])

  if (!personRes.data) redirect('/sign-in')

  const prefs = (prefsRes.data ?? []).map(p => ({
    type:     p.notification_type as string,
    channel:  p.channel as 'email' | 'sms',
    optedOut: p.opted_out,
  }))

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">Profile</h1>
      <ProfileForm person={personRes.data} />
      <NotificationPrefsSection prefs={prefs} />
    </div>
  )
}
