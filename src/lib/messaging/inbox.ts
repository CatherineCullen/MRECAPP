import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardianMessageLabel, adminLabel } from './displayName'

export interface InboxRow {
  threadId:       string
  /**
   * Header label per Catherine's rule: the first two participants form
   * the label; later joiners (admin) stay silent. So if the viewer is one
   * of the original pair, the label is the OTHER pair member. If the
   * viewer is a later joiner (admin in someone else's thread), the label
   * is both original-pair members joined.
   */
  headerLabel:    string
  /** First ~80 chars of the latest message body. Empty if no messages. */
  preview:        string
  /** Timestamp of the latest message, or thread creation if none yet. */
  lastActivityAt: string
  /** True if the viewer has unread messages from someone else in this thread. */
  unread:         boolean
}

/**
 * Build the inbox view for a viewer. Returns one row per thread the
 * viewer participates in, ordered by most recent activity.
 *
 * N+1 in label/preview lookups, but inbox cardinality is small per user.
 */
export async function loadInboxForPerson(viewerId: string): Promise<InboxRow[]> {
  const db = createAdminClient()

  // 1) Threads the viewer participates in + their read state.
  const { data: parts } = await db
    .from('thread_participant')
    .select('thread_id, last_read_at')
    .eq('person_id', viewerId)

  if (!parts || parts.length === 0) return []

  const threadIds = parts.map(p => p.thread_id)
  const lastReadByThread = new Map(parts.map(p => [p.thread_id, p.last_read_at]))

  // 2) Threads + pair anchors.
  const { data: threads } = await db
    .from('thread')
    .select('id, pair_a_id, pair_b_id, created_at, updated_at')
    .in('id', threadIds)
    .order('updated_at', { ascending: false })

  // 3) Latest message per thread + check for any unread.
  const rows: InboxRow[] = await Promise.all((threads ?? []).map(async t => {
    const { data: lastMsg } = await db
      .from('message')
      .select('body, system_prefix, created_at, sender_id')
      .eq('thread_id', t.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastReadAt = lastReadByThread.get(t.id)

    let unread = false
    if (lastMsg && lastMsg.sender_id !== viewerId) {
      unread = !lastReadAt || lastMsg.created_at > lastReadAt
    }

    const preview = (() => {
      if (!lastMsg) return ''
      const text = lastMsg.body ?? ''
      return text.length > 80 ? `${text.slice(0, 80)}…` : text
    })()

    // Label: the other of the original pair, or both if viewer isn't in the pair.
    const inPair = viewerId === t.pair_a_id || viewerId === t.pair_b_id
    let headerLabel: string
    if (inPair) {
      const otherId = viewerId === t.pair_a_id ? t.pair_b_id : t.pair_a_id
      headerLabel = await labelForPerson(otherId)
    } else {
      const [labelA, labelB] = await Promise.all([
        labelForPerson(t.pair_a_id),
        labelForPerson(t.pair_b_id),
      ])
      headerLabel = `${labelA} ↔ ${labelB}`
    }

    return {
      threadId:       t.id,
      headerLabel,
      preview,
      lastActivityAt: lastMsg?.created_at ?? t.updated_at,
      unread,
    }
  }))

  // Sort: unread first, then by last activity desc.
  rows.sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1
    return b.lastActivityAt.localeCompare(a.lastActivityAt)
  })

  return rows
}

/**
 * Label for a single person: guardian-decorated, plus "(admin)" suffix
 * if they hold the admin role.
 */
async function labelForPerson(personId: string): Promise<string> {
  const db = createAdminClient()
  const baseLabel = await guardianMessageLabel(personId)

  const { data: roles } = await db
    .from('person_role')
    .select('role')
    .eq('person_id', personId)
    .in('role', ['admin', 'barn_owner'])
    .is('deleted_at', null)
    .limit(1)

  return (roles ?? []).length > 0 ? adminLabel(baseLabel) : baseLabel
}

export interface ThreadDetail {
  threadId: string
  headerLabel: string
  /** Full ordered message list, oldest first (chronological reading order). */
  messages: Array<{
    id:           string
    senderId:     string
    senderLabel:  string
    isViewer:     boolean
    isAdmin:      boolean
    body:         string
    systemPrefix: string | null
    lessonId:     string | null
    /** Lesson tag context for display, populated when lessonId is set. */
    lessonContext: { scheduledAt: string; lessonType: string } | null
    createdAt:    string
  }>
}

/**
 * Full thread view for the viewer. Returns the same headerLabel logic as
 * the inbox row plus the full message history with per-message sender
 * labels resolved.
 */
export async function loadThread(threadId: string, viewerId: string): Promise<ThreadDetail | null> {
  const db = createAdminClient()

  const { data: thread } = await db
    .from('thread')
    .select('id, pair_a_id, pair_b_id')
    .eq('id', threadId)
    .maybeSingle()

  if (!thread) return null

  // Authz: viewer must be a participant.
  const { data: part } = await db
    .from('thread_participant')
    .select('id')
    .eq('thread_id', threadId)
    .eq('person_id', viewerId)
    .maybeSingle()

  if (!part) return null

  // Header label: same rule as inbox.
  const inPair = viewerId === thread.pair_a_id || viewerId === thread.pair_b_id
  let headerLabel: string
  if (inPair) {
    const otherId = viewerId === thread.pair_a_id ? thread.pair_b_id : thread.pair_a_id
    headerLabel = await labelForPerson(otherId)
  } else {
    const [a, b] = await Promise.all([labelForPerson(thread.pair_a_id), labelForPerson(thread.pair_b_id)])
    headerLabel = `${a} ↔ ${b}`
  }

  // Messages — chronological ascending for natural reading.
  const { data: msgs } = await db
    .from('message')
    .select('id, sender_id, body, system_prefix, lesson_id, created_at')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  // Resolve sender labels (one lookup per unique sender).
  const senderIds = [...new Set((msgs ?? []).map(m => m.sender_id))]
  const senderLabels = new Map<string, { label: string; isAdmin: boolean }>()
  await Promise.all(senderIds.map(async id => {
    const base = await guardianMessageLabel(id)
    const { data: roles } = await db
      .from('person_role')
      .select('role')
      .eq('person_id', id)
      .in('role', ['admin', 'barn_owner'])
      .is('deleted_at', null)
      .limit(1)
    const isAdmin = (roles ?? []).length > 0
    senderLabels.set(id, { label: isAdmin ? adminLabel(base) : base, isAdmin })
  }))

  // Resolve lesson context for tagged messages (one lookup per unique lesson).
  const lessonIds = [...new Set((msgs ?? []).map(m => m.lesson_id).filter(Boolean) as string[])]
  const lessonContext = new Map<string, { scheduledAt: string; lessonType: string }>()
  if (lessonIds.length > 0) {
    const { data: lessons } = await db
      .from('lesson')
      .select('id, scheduled_at, lesson_type')
      .in('id', lessonIds)
    for (const l of lessons ?? []) {
      lessonContext.set(l.id, { scheduledAt: l.scheduled_at, lessonType: l.lesson_type })
    }
  }

  const messages = (msgs ?? []).map(m => {
    const meta = senderLabels.get(m.sender_id) ?? { label: '—', isAdmin: false }
    return {
      id:           m.id,
      senderId:     m.sender_id,
      senderLabel:  meta.label,
      isViewer:     m.sender_id === viewerId,
      isAdmin:      meta.isAdmin,
      body:         m.body,
      systemPrefix: m.system_prefix,
      lessonId:     m.lesson_id,
      lessonContext: m.lesson_id ? lessonContext.get(m.lesson_id) ?? null : null,
      createdAt:    m.created_at,
    }
  })

  return { threadId, headerLabel, messages }
}
