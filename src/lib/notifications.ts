import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { OutboundDisabledError } from '@/lib/outbound'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']
type NotificationChannel = Database['public']['Enums']['notification_channel']

interface NotifyParams {
  personId:  string
  type:      NotificationType
  referenceId: string  // lesson_id, invoice_id, etc.
  email?: string | null
  phone?: string | null
  subject:   string
  html:      string
  smsBody:   string
}

/**
 * Send email and/or SMS to a person, respecting their opt-out preferences
 * and deduplicating against notification_log. Swallows OutboundDisabledError
 * silently so callers don't need to handle the dev/preview no-op case.
 *
 * Does NOT throw — log errors and move on so the parent action always succeeds.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const db = createAdminClient()

  // Load opt-outs for this person + type
  const { data: prefs } = await db
    .from('notification_preference')
    .select('channel, opted_out')
    .eq('person_id', params.personId)
    .eq('notification_type', params.type)
    .is('deleted_at', null)

  const optedOut = new Set(
    (prefs ?? []).filter(p => p.opted_out).map(p => p.channel),
  )

  // Load already-sent logs for this person + type + reference
  const { data: sent } = await db
    .from('notification_log')
    .select('channel')
    .eq('person_id', params.personId)
    .eq('notification_type', params.type)
    .eq('reference_id', params.referenceId)

  const alreadySent = new Set((sent ?? []).map(s => s.channel))

  const channels: NotificationChannel[] = []
  if (params.email && !optedOut.has('email') && !alreadySent.has('email')) channels.push('email')
  if (params.phone && !optedOut.has('sms')   && !alreadySent.has('sms'))   channels.push('sms')

  for (const channel of channels) {
    try {
      if (channel === 'email') {
        await sendEmail({ to: params.email!, subject: params.subject, html: params.html })
      } else {
        await sendSms({ to: params.phone!, body: params.smsBody })
      }
      await db.from('notification_log').insert({
        person_id:         params.personId,
        notification_type: params.type,
        channel,
        reference_id:      params.referenceId,
      })
    } catch (err) {
      if (err instanceof OutboundDisabledError) return  // expected in dev/preview
      console.error(`[notify] Failed to send ${channel} ${params.type} to ${params.personId}`, err)
    }
  }
}
