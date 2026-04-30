import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notifications'
import { getAppOrigin } from '@/lib/appUrl'
import { guardianMessageLabel, adminLabel } from './displayName'

const THROTTLE_WINDOW_MS = 60 * 1000  // 60 seconds per Q-MSG-5

const SMS_PREVIEW_CAP = 80

/**
 * Notify all recipients of a new message: every thread participant
 * except the sender. SMS is gated by a 60-second per-thread debounce
 * so chatty threads don't blast a recipient's phone.
 *
 * - The first SMS in a 60s window goes through.
 * - Subsequent messages in the same window: in-app only, no SMS.
 * - The throttle bumps once per allowed-SMS attempt; we don't track
 *   per-recipient delivery success because notify() swallows errors
 *   (opt-out, no phone, kill switch). The intent — at most one buzz
 *   per minute per thread — is preserved.
 *
 * Push notifications wire in here in Phase 10.
 */
export async function notifyNewMessage(args: {
  threadId:   string
  messageId:  string
  senderId:   string
  body:       string
}): Promise<void> {
  const db = createAdminClient()

  // Recipients = participants except sender. Use the full participant
  // set, not just the original pair, so admin (joined later) also gets
  // notified when someone posts in their thread.
  const { data: parts } = await db
    .from('thread_participant')
    .select('person_id')
    .eq('thread_id', args.threadId)

  const recipientIds = (parts ?? [])
    .map(p => p.person_id)
    .filter(id => id !== args.senderId)

  if (recipientIds.length === 0) return

  // Resolve recipient phones + opt-in defaults inline (filter out
  // deactivated people too).
  const { data: people } = await db
    .from('person')
    .select('id, email, phone, deleted_at')
    .in('id', recipientIds)

  const activeRecipients = (people ?? []).filter(p => !p.deleted_at)
  if (activeRecipients.length === 0) return

  // Sender label + preview — the same SMS body gets rendered for
  // each recipient, but each recipient gets their own notify() call so
  // opt-out + log dedup are tracked per-person.
  const senderLabel = await senderDisplayLabel(args.senderId)
  const preview = args.body.length > SMS_PREVIEW_CAP
    ? `${args.body.slice(0, SMS_PREVIEW_CAP)}…`
    : args.body
  const appUrl = await getAppOrigin()

  // Throttle check: per-thread, single decision applies to all
  // recipients on this send.
  const { data: throttle } = await db
    .from('thread_sms_throttle')
    .select('last_sms_at')
    .eq('thread_id', args.threadId)
    .maybeSingle()

  const now = Date.now()
  const smsAllowed = !throttle || (now - new Date(throttle.last_sms_at).getTime()) > THROTTLE_WINDOW_MS

  for (const r of activeRecipients) {
    await notify({
      personId:    r.id,
      type:        'message_received',
      referenceId: args.messageId,
      email:       null,                         // message_received has no email template by design
      phone:       smsAllowed ? r.phone : null,  // throttle: gate SMS, never email
      vars: {
        sender_name: senderLabel,
        preview,
        app_url:     appUrl,
      },
    })
  }

  if (smsAllowed) {
    await db
      .from('thread_sms_throttle')
      .upsert(
        { thread_id: args.threadId, last_sms_at: new Date(now).toISOString() },
        { onConflict: 'thread_id' },
      )
  }
}

async function senderDisplayLabel(personId: string): Promise<string> {
  const db = createAdminClient()
  const base = await guardianMessageLabel(personId)
  const { data: roles } = await db
    .from('person_role')
    .select('role')
    .eq('person_id', personId)
    .in('role', ['admin', 'barn_owner'])
    .is('deleted_at', null)
    .limit(1)
  return (roles ?? []).length > 0 ? adminLabel(base) : base
}
