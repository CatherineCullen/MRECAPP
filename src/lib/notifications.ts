import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { OutboundDisabledError } from '@/lib/outbound'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']
type NotificationChannel = Database['public']['Enums']['notification_channel']

interface NotifyParams {
  personId:    string
  type:        NotificationType
  referenceId: string
  email?:      string | null
  phone?:      string | null
  subject:     string
  html:        string
  smsBody:     string
}

/**
 * Send email and/or SMS to a person, respecting:
 *   1. Global notification_config toggles (admin-controlled per type)
 *   2. Per-user notification_preference opt-outs
 *   3. notification_log deduplication (never send the same type+reference twice)
 *
 * Swallows OutboundDisabledError silently — expected in dev/preview.
 * Never throws — log errors so the parent action always succeeds.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const db = createAdminClient()

  // Load global config for this type
  const { data: config } = await db
    .from('notification_config')
    .select('email_enabled, sms_enabled')
    .eq('notification_type', params.type)
    .maybeSingle()

  // Unknown type (no seed row) → skip
  if (!config) return

  // Load per-user opt-outs
  const { data: prefs } = await db
    .from('notification_preference')
    .select('channel, opted_out')
    .eq('person_id', params.personId)
    .eq('notification_type', params.type)
    .is('deleted_at', null)

  const optedOut = new Set(
    (prefs ?? []).filter(p => p.opted_out).map(p => p.channel),
  )

  // Load already-sent dedup log
  const { data: sent } = await db
    .from('notification_log')
    .select('channel')
    .eq('person_id', params.personId)
    .eq('notification_type', params.type)
    .eq('reference_id', params.referenceId)

  const alreadySent = new Set((sent ?? []).map(s => s.channel))

  const channels: NotificationChannel[] = []
  if (config.email_enabled && params.email && !optedOut.has('email') && !alreadySent.has('email'))
    channels.push('email')
  if (config.sms_enabled && params.phone && !optedOut.has('sms') && !alreadySent.has('sms'))
    channels.push('sms')

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
      if (err instanceof OutboundDisabledError) return
      console.error(`[notify] Failed to send ${channel} ${params.type} to ${params.personId}`, err)
    }
  }
}
