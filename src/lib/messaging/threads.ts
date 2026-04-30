import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sort a participant pair so the smaller UUID is first. The thread table's
 * unique index on (pair_a_id, pair_b_id) requires this ordering — both
 * sides of a pair always resolve to the same row.
 */
function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * Find an existing thread for the participant pair (rider+instructor or
 * admin+person). Returns null if no thread exists.
 *
 * The pair lookup uses the locked pair_a_id/pair_b_id columns — these are
 * the original two participants and never change, even after admin joins
 * the thread later as a third participant. That's what gives the inbox
 * label rule its "first two" anchor.
 */
export async function findThread(personA: string, personB: string): Promise<string | null> {
  const [a, b] = sortPair(personA, personB)
  const db = createAdminClient()
  const { data } = await db
    .from('thread')
    .select('id')
    .eq('pair_a_id', a)
    .eq('pair_b_id', b)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Find the thread for a pair, or create it. Used by sendMessage when a
 * compose targets someone the sender has never messaged before.
 *
 * Concurrency: two simultaneous first-message sends between the same pair
 * could both reach the insert. The unique index on (pair_a_id, pair_b_id)
 * guarantees only one wins; the loser re-fetches and uses the existing
 * row. This is the standard upsert-then-reselect pattern.
 *
 * Also ensures both participants have thread_participant rows. If one
 * exists but not the other (data drift), the missing one is inserted.
 */
export async function getOrCreateThread(personA: string, personB: string): Promise<string> {
  const [a, b] = sortPair(personA, personB)
  const db = createAdminClient()

  let { data: existing } = await db
    .from('thread')
    .select('id')
    .eq('pair_a_id', a)
    .eq('pair_b_id', b)
    .maybeSingle()

  let threadId = existing?.id

  if (!threadId) {
    const { data: created, error } = await db
      .from('thread')
      .insert({ pair_a_id: a, pair_b_id: b })
      .select('id')
      .single()

    if (error) {
      // Race: another insert won. Re-fetch.
      const { data: refetch } = await db
        .from('thread')
        .select('id')
        .eq('pair_a_id', a)
        .eq('pair_b_id', b)
        .maybeSingle()
      if (!refetch) throw new Error(`Failed to create thread: ${error.message}`)
      threadId = refetch.id
    } else {
      threadId = created.id
    }
  }

  // Ensure participant rows for the original pair exist. Idempotent —
  // unique constraint catches duplicates.
  const { data: existingParticipants } = await db
    .from('thread_participant')
    .select('person_id')
    .eq('thread_id', threadId)

  const existingIds = new Set((existingParticipants ?? []).map(p => p.person_id))
  const missing = [a, b].filter(id => !existingIds.has(id))
  if (missing.length > 0) {
    await db
      .from('thread_participant')
      .insert(missing.map(person_id => ({ thread_id: threadId, person_id })))
  }

  return threadId
}

/**
 * Add `personId` as a participant in an existing thread (no-op if already
 * a participant). Used by admin-posts-in-thread: admin becomes the third
 * participant the moment they post.
 */
export async function joinThread(threadId: string, personId: string): Promise<void> {
  const db = createAdminClient()
  await db
    .from('thread_participant')
    .upsert(
      { thread_id: threadId, person_id: personId },
      { onConflict: 'thread_id,person_id', ignoreDuplicates: true },
    )
}

/**
 * Mark a thread as read for `personId` up to "now". Caller fires this
 * when the user opens the thread view.
 */
export async function markThreadRead(threadId: string, personId: string): Promise<void> {
  const db = createAdminClient()
  await db
    .from('thread_participant')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('person_id', personId)
}

/**
 * Unread count for a viewer across all their threads. Used for the
 * Messages tab badge. A thread is unread if any message in it was
 * created after the viewer's last_read_at (or last_read_at is null
 * and there's at least one message they didn't send).
 */
export async function unreadThreadCountForPerson(personId: string): Promise<number> {
  const db = createAdminClient()

  const { data: parts } = await db
    .from('thread_participant')
    .select('thread_id, last_read_at')
    .eq('person_id', personId)

  if (!parts || parts.length === 0) return 0

  let count = 0
  for (const p of parts) {
    const q = db
      .from('message')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', p.thread_id)
      .neq('sender_id', personId)
      .is('deleted_at', null)
    const cutoff = p.last_read_at
    const { count: unread } = await (cutoff ? q.gt('created_at', cutoff) : q)
    if ((unread ?? 0) > 0) count++
  }
  return count
}
