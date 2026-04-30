'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sendMessage } from '@/lib/messaging/messages'
import { markThreadRead, getOrCreateThread } from '@/lib/messaging/threads'

/**
 * Admin posts in any thread. If admin isn't already a participant, the
 * underlying sendMessage flow joins them as a third participant. From
 * that moment on, admin's last_read_at is tracked and other participants
 * marking the thread bumps unread.
 */
export async function adminPostInThread(args: {
  threadId:    string
  body:        string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }
  if (!user.personId) return { error: 'Missing person record.' }

  const body = args.body.trim()
  if (!body) return { error: 'Message cannot be empty.' }

  // Resolve the recipient as one of the original pair so sendMessage's
  // thread-resolution finds the existing thread instead of treating
  // this as a new admin↔(pair member) thread.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  const { data: t } = await db.from('thread').select('pair_a_id, pair_b_id').eq('id', args.threadId).maybeSingle()
  if (!t) return { error: 'Thread not found.' }

  // Pick whichever pair member isn't the admin (admin won't be in the
  // pair if it's a regular rider↔instructor thread; if it's an
  // admin-initiated thread, both should still resolve correctly via the
  // pair lookup).
  const recipientId = user.personId === t.pair_a_id ? t.pair_b_id : t.pair_a_id

  try {
    await sendMessage({
      senderId:             user.personId,
      recipientId,
      body,
      skipEligibilityCheck: true, // admin can post anywhere
    })
    revalidatePath('/chia/messages')
    revalidatePath(`/chia/messages/${args.threadId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send message.' }
  }
}

/**
 * Admin starts a new thread with a person (rider or instructor). Resolves
 * the thread and redirects to it.
 */
export async function adminOpenThreadWith(recipientId: string): Promise<never> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')
  if (!user.personId) redirect('/sign-in')

  const threadId = await getOrCreateThread(user.personId, recipientId)
  redirect(`/chia/messages/${threadId}`)
}

/**
 * Mark thread read for the admin. Used on thread-view mount.
 */
export async function adminMarkThreadRead(threadId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin || !user.personId) return { error: 'Admin only.' }
  await markThreadRead(threadId, user.personId)
  revalidatePath('/chia/messages')
  return {}
}
