import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { OutboundDisabledError } from '@/lib/outbound'
import { renderTemplate, wrapEmailBody } from '@/lib/renderTemplate'
import type { Database } from '@/lib/supabase/types'

type NotificationType = Database['public']['Enums']['notification_type']
type NotificationChannel = Database['public']['Enums']['notification_channel']

export interface NotifyParams {
  personId:    string
  type:        NotificationType
  referenceId: string
  email?:      string | null
  phone?:      string | null
  /** Template variables — substituted into {{variable}} tokens at send time. */
  vars:        Record<string, string>
}

/**
 * Send email and/or SMS to a person using the editable DB template for this
 * notification type. Respects:
 *   1. Global notification_config toggles
 *   2. Per-user notification_preference opt-outs
 *   3. notification_log deduplication
 *
 * Swallows OutboundDisabledError silently — expected in dev/preview.
 * Never throws — parent action always succeeds.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const db = createAdminClient()

  // 1. Global config — bail early if type is unknown
  const { data: config } = await db
    .from('notification_config')
    .select('email_enabled, sms_enabled')
    .eq('notification_type', params.type)
    .maybeSingle()
  if (!config) return

  // 2. Per-user opt-outs
  const { data: prefs } = await db
    .from('notification_preference')
    .select('channel, opted_out')
    .eq('person_id', params.personId)
    .eq('notification_type', params.type)
    .is('deleted_at', null)
  const optedOut = new Set((prefs ?? []).filter(p => p.opted_out).map(p => p.channel))

  // 3. Dedup
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
  if (channels.length === 0) return

  // 4. Load templates for the channels we need
  const { data: templates } = await db
    .from('notification_template')
    .select('channel, subject, body')
    .eq('notification_type', params.type)
    .in('channel', channels)

  const tmplByChannel = Object.fromEntries((templates ?? []).map(t => [t.channel, t]))

  for (const channel of channels) {
    const tmpl = tmplByChannel[channel]
    if (!tmpl) {
      console.warn(`[notify] No template found for ${params.type}/${channel} — skipping`)
      continue
    }

    try {
      if (channel === 'email') {
        const subject = renderTemplate(tmpl.subject ?? params.type, params.vars)
        const html    = wrapEmailBody(renderTemplate(tmpl.body, params.vars))
        await sendEmail({ to: params.email!, subject, html })
      } else {
        const body = renderTemplate(tmpl.body, params.vars)
        await sendSms({ to: params.phone!, body })
      }

      await db.from('notification_log').insert({
        person_id:         params.personId,
        notification_type: params.type,
        channel,
        reference_id:      params.referenceId,
      })
    } catch (err) {
      if (err instanceof OutboundDisabledError) return
      console.error(`[notify] Failed ${channel} ${params.type} → ${params.personId}`, err)
    }
  }
}
