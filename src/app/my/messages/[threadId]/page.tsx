import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { loadThread } from '@/lib/messaging/inbox'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatBarnDateTime, formatBarnTime } from '@/lib/datetime'
import MarkReadOnMount from '../_components/MarkReadOnMount'
import Composer from '../_components/Composer'

export const metadata = { title: 'Conversation — Marlboro Ridge Equestrian Center' }
export const dynamic = 'force-dynamic'

const LESSON_TYPE_LABEL: Record<string, string> = {
  private:      'Private lesson',
  semi_private: 'Semi-private lesson',
  group:        'Group lesson',
}

/** Human-readable cluster header: "Today", "Yesterday", or full date. */
function dayHeading(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params:       Promise<{ threadId: string }>
  searchParams: Promise<{ lesson?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const { threadId } = await params
  const { lesson: lessonIdParam } = await searchParams
  const detail = await loadThread(threadId, user.personId)
  if (!detail) notFound()

  // Resolve recipient = the other person in the original pair.
  const db = createAdminClient()
  const { data: t } = await db
    .from('thread')
    .select('pair_a_id, pair_b_id')
    .eq('id', threadId)
    .single()
  if (!t) notFound()
  const recipientId = user.personId === t.pair_a_id ? t.pair_b_id : t.pair_a_id

  // Group messages by day for cluster headings.
  const grouped: Array<{ heading: string; items: typeof detail.messages }> = []
  for (const m of detail.messages) {
    const heading = dayHeading(m.createdAt)
    const last = grouped[grouped.length - 1]
    if (last && last.heading === heading) last.items.push(m)
    else grouped.push({ heading, items: [m] })
  }

  return (
    <div className="space-y-3">
      <MarkReadOnMount threadId={threadId} />

      {/* Header */}
      <div className="flex items-baseline justify-between px-1">
        <Link href="/my/messages" className="text-xs text-secondary hover:text-primary">← Messages</Link>
        <h1 className="text-base font-bold text-on-surface truncate ml-3">{detail.headerLabel}</h1>
      </div>

      <div className="bg-surface-highest/40 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface-muted">
        Administrative staff can view and respond to all messages.
      </div>

      {/* Thread */}
      <div className="space-y-3">
        {grouped.length === 0 && (
          <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
            <p className="text-sm text-on-surface-muted">No messages yet. Say hello.</p>
          </div>
        )}

        {grouped.map((g, i) => (
          <div key={i} className="space-y-1.5">
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-muted">
                {g.heading}
              </span>
            </div>
            {g.items.map(m => {
              const align = m.isViewer ? 'items-end' : 'items-start'
              // Tonal palette per Heritage Atelier: pale fills, no loud
              // primary navy. Position (right vs left) carries the
              // sent/received distinction; color distinguishes admin
              // presence from regular replies.
              const bubble = m.isViewer
                ? 'bg-primary-fixed text-primary'
                : m.isAdmin
                  ? 'bg-secondary-fixed text-on-secondary-fixed'
                  : 'bg-surface-highest text-on-surface'

              return (
                <div key={m.id} className={`flex flex-col ${align}`}>
                  {!m.isViewer && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-muted px-1">
                      {m.senderLabel}
                    </span>
                  )}

                  {m.lessonContext && (
                    <div className="bg-surface-low rounded-t-lg px-3 py-1 mt-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-on-surface-muted">
                        {formatBarnDateTime(m.lessonContext.scheduledAt)} · {LESSON_TYPE_LABEL[m.lessonContext.lessonType] ?? m.lessonContext.lessonType}
                      </span>
                    </div>
                  )}

                  <div className={`max-w-[80%] px-3 py-2 ${bubble} ${m.lessonContext ? 'rounded-b-lg rounded-tr-lg' : 'rounded-lg'}`}>
                    {m.systemPrefix && (
                      <p className="text-[11px] italic text-on-surface-muted mb-0.5">{m.systemPrefix}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  </div>

                  <span className="text-[10px] text-on-surface-muted px-1 mt-0.5">
                    {formatBarnTime(m.createdAt)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Composer */}
      <Composer
        recipientId={recipientId}
        recipientLabel={detail.headerLabel}
        lessonId={lessonIdParam ?? null}
      />
    </div>
  )
}
