import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateThread, joinThread } from './threads'
import { canMessage } from './eligibility'
import { notifyNewMessage } from './notify'

export interface SendMessageParams {
  /** Person sending the message — typically getCurrentUser().personId. */
  senderId: string
  /** Recipient person ID — drives thread routing. */
  recipientId: string
  /** Message body. Empty string is invalid. */
  body: string
  /** Optional lesson tag — annotation only, does not affect routing. */
  lessonId?: string | null
  /** Optional system-injected context (e.g. cancel prefix). */
  systemPrefix?: string | null
  /**
   * If true, skip the eligibility check. Used by trusted server flows
   * (cancellation, admin actions) where the caller has already verified
   * authorization. Defaults to false — direct user actions must always
   * eligibility-check.
   */
  skipEligibilityCheck?: boolean
}

export interface SendMessageResult {
  threadId: string
  messageId: string
}

/**
 * Core send action. Resolves or creates the thread for the (sender,
 * recipient) pair, inserts the message, and bumps thread.updated_at so
 * the thread re-sorts to the top of inboxes.
 *
 * If the sender is admin and the thread already exists between two other
 * people (rider↔instructor), this also adds admin as a third participant
 * (joinThread). After this point admin's last_read_at is tracked, and
 * subsequent posts by anyone else will mark the thread unread for admin.
 *
 * Notification dispatch (SMS, push) is wired in Phase 7 — this function
 * currently only writes to the DB.
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { senderId, recipientId, body, lessonId, systemPrefix } = params

  if (!body.trim() && !systemPrefix) {
    throw new Error('Message body cannot be empty')
  }

  if (!params.skipEligibilityCheck) {
    const allowed = await canMessage(senderId, recipientId)
    if (!allowed) throw new Error('Not authorized to message this recipient')
  }

  const db = createAdminClient()

  // Resolve thread for the sender↔recipient pair. This locks the original
  // pair on creation — admin joining later is handled separately.
  const threadId = await getOrCreateThread(senderId, recipientId)

  // If the sender is the admin posting into a thread between two other
  // people, ensure they're a participant so unread tracking works.
  // (For a sender that's already in the locked pair, joinThread is a
  // no-op via the unique constraint.)
  await joinThread(threadId, senderId)

  const nowIso = new Date().toISOString()

  const { data: msg, error: msgErr } = await db
    .from('message')
    .insert({
      thread_id:     threadId,
      sender_id:     senderId,
      body:          body.trim(),
      lesson_id:     lessonId ?? null,
      system_prefix: systemPrefix ?? null,
    })
    .select('id')
    .single()

  if (msgErr || !msg) throw new Error(`Failed to send message: ${msgErr?.message}`)

  await db.from('thread').update({ updated_at: nowIso }).eq('id', threadId)

  // Fire-and-forget notification dispatch. Errors are swallowed inside
  // notify() (kill switch, missing template, opt-outs) so the parent
  // sendMessage call never fails because of an SMS hiccup.
  await notifyNewMessage({
    threadId,
    messageId: msg.id,
    senderId,
    body,
  })

  return { threadId, messageId: msg.id }
}
