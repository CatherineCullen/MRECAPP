'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sendMessage } from '@/lib/messaging/messages'
import { markThreadRead, getOrCreateThread } from '@/lib/messaging/threads'

/**
 * Send a message from the current user. Used by:
 *   - the inbox composer (no lesson tag)
 *   - the lesson card "Message instructor" entry (with lesson tag)
 *   - the cancel-with-note flow (Phase 6)
 *
 * Returns the threadId so the client can redirect to the thread view.
 */
export async function sendMyMessage(args: {
  recipientId: string
  body:        string
  lessonId?:   string | null
}): Promise<{ threadId: string; error?: undefined } | { threadId?: undefined; error: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const body = args.body.trim()
  if (!body) return { error: 'Message cannot be empty.' }

  try {
    const result = await sendMessage({
      senderId:    user.personId,
      recipientId: args.recipientId,
      body,
      lessonId:    args.lessonId ?? null,
    })
    revalidatePath('/my/messages')
    revalidatePath(`/my/messages/${result.threadId}`)
    return { threadId: result.threadId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send message.' }
  }
}

/**
 * Mark a thread read up to "now" for the current user. Fired on thread
 * view mount.
 */
export async function markThreadReadAction(threadId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }
  await markThreadRead(threadId, user.personId)
  revalidatePath('/my/messages')
  return {}
}

/**
 * Resolve (or create) a thread between the current user and a recipient,
 * then redirect to it. Used by lesson-card "Message X" buttons — opens
 * the existing conversation instead of starting a new compose flow.
 */
export async function openThreadWith(args: {
  recipientId: string
  lessonId?:   string | null
}): Promise<never> {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const threadId = await getOrCreateThread(user.personId, args.recipientId)
  const params = new URLSearchParams()
  if (args.lessonId) params.set('lesson', args.lessonId)
  const qs = params.toString()
  redirect(`/my/messages/${threadId}${qs ? `?${qs}` : ''}`)
}
