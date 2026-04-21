import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NotificationConfigTable from './_components/NotificationConfigTable'

export const metadata = { title: 'Notification Settings — CHIA' }

const NOTIFICATION_META: Record<string, {
  label:       string
  description: string
  wired:       boolean
  note?:       string
}> = {
  lesson_reminder: {
    label:       'Lesson Reminder',
    description: '24 hours before a scheduled lesson. Sent to each active rider on the lesson.',
    wired:       true,
  },
  lesson_cancellation: {
    label:       'Lesson Cancellation',
    description: 'When a lesson is cancelled (whole lesson or per-rider). Sent to affected riders. Barn-cancel messages mention the makeup token.',
    wired:       true,
  },
  invoice: {
    label:       'Invoice Sent',
    description: 'When an invoice is finalized and sent via Stripe. Stripe already emails the payment link, so SMS only is the default.',
    wired:       true,
    note:        'Stripe sends the invoice email — enabling email here sends a second message.',
  },
  makeup_token: {
    label:       'Makeup Token Issued',
    description: 'When admin manually grants a makeup token outside of a cancellation flow.',
    wired:       false,
  },
  lesson_confirmation: {
    label:       'Lesson Confirmation',
    description: 'When a new lesson is scheduled for a rider.',
    wired:       false,
  },
  lesson_type_change: {
    label:       'Lesson Type Change',
    description: 'When a lesson changes type (e.g. private → semi-private) due to riders joining or leaving.',
    wired:       false,
  },
  health_alert: {
    label:       'Health Alert',
    description: 'When a Coggins or recurring health item is due or overdue.',
    wired:       false,
  },
  renewal_notice: {
    label:       'Renewal Notice',
    description: 'Quarterly renewal reminder sent to riders before the new quarter.',
    wired:       false,
  },
}

export default async function NotificationsSettingsPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')

  const db = createAdminClient()
  const { data: configs } = await db
    .from('notification_config')
    .select('notification_type, email_enabled, sms_enabled, updated_at')
    .order('notification_type')

  const rows = (configs ?? []).map(c => ({
    type:         c.notification_type,
    emailEnabled: c.email_enabled,
    smsEnabled:   c.sms_enabled,
    updatedAt:    c.updated_at,
    ...NOTIFICATION_META[c.notification_type],
  }))

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#002058]">Notification Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Global on/off toggles for each notification type. These apply to everyone —
          individual riders can further opt out from their own profile.
        </p>
      </div>
      <NotificationConfigTable rows={rows} />
    </div>
  )
}
