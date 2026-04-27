import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './_components/ProfileForm'
import PasswordSection from './_components/PasswordSection'
import NotificationPrefsSection from './_components/NotificationPrefsSection'
import CalendarSection from './_components/CalendarSection'
import { headers } from 'next/headers'

export const metadata = { title: 'Profile — Marlboro Ridge Equestrian Center' }

export default async function MyProfilePage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const db = createAdminClient()

  const [personRes, prefsRes, configRes] = await Promise.all([
    db.from('person')
      .select('first_name, last_name, email, phone, address, emergency_contact_name, emergency_contact_phone, ical_token')
      .eq('id', user.personId)
      .maybeSingle(),
    db.from('notification_preference')
      .select('notification_type, channel, opted_out')
      .eq('person_id', user.personId)
      .is('deleted_at', null),
    db.from('notification_config')
      .select('notification_type, email_enabled, sms_enabled'),
  ])

  if (!personRes.data) redirect('/sign-in')

  const prefs = (prefsRes.data ?? []).map(p => ({
    type:     p.notification_type as string,
    channel:  p.channel as 'email' | 'sms',
    optedOut: p.opted_out,
  }))

  const config = (configRes.data ?? []).map(c => ({
    type:         c.notification_type as string,
    emailEnabled: c.email_enabled,
    smsEnabled:   c.sms_enabled,
  }))

  const reqHeaders = await headers()
  const host     = reqHeaders.get('host') ?? 'localhost:3000'
  const proto    = reqHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin   = `${proto}://${host}`

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide px-1">Profile</h1>
      <ProfileForm person={personRes.data} />
      <PasswordSection />
      <CalendarSection icalToken={personRes.data.ical_token} origin={origin} />
      <NotificationPrefsSection prefs={prefs} config={config} />
    </div>
  )
}
