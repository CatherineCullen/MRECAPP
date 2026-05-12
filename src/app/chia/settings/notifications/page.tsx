import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isOutboundEnabled } from '@/lib/outbound'
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
    description: 'NMI emails the payment link directly when an invoice is sent. A separate confirmation from CHIA is not currently wired up.',
    wired:       false,
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
  message_received: {
    label:       'In-App Message',
    description: 'When a rider, instructor, or admin posts in a thread. SMS preview includes the sender name and first 80 characters. Per-thread debounce of 60 seconds prevents SMS storms on chatty threads.',
    wired:       true,
  },
  enrollment_invite: {
    label:       'Enrollment Invitation',
    description: 'When admin invites a new person (or family) to enroll, or re-sends an enrollment link. Emails the recipient a link to complete waivers and sign-up. If disabled, the invite link is still generated and admin can share it manually. SMS not used.',
    wired:       true,
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

  const outboundOn = isOutboundEnabled()

  return (
    <div>
      <p className="text-sm text-gray-500 mb-5">
        Global on/off toggles for each notification type. These apply to everyone —
        individual riders can further opt out from their own profile.
      </p>
      <NotificationConfigTable rows={rows} />

      <div className={`mt-6 rounded border px-3 py-2 text-xs flex items-center gap-2 ${
        outboundOn
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}>
        <span className={`inline-block w-2 h-2 rounded-full ${outboundOn ? 'bg-green-500' : 'bg-amber-500'}`} />
        <span>
          <strong>Outbound gate: {outboundOn ? 'ENABLED' : 'DISABLED'}.</strong>{' '}
          {outboundOn
            ? 'Real emails and texts will be sent to recipients.'
            : 'No emails or texts will actually send, regardless of the toggles above. Set OUTBOUND_ENABLED=true in production to enable.'}
        </span>
      </div>
    </div>
  )
}
