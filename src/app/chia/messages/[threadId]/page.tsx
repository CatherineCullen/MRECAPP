import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { loadThread } from '@/lib/messaging/inbox'
import { formatBarnDateTime, formatBarnTime } from '@/lib/datetime'
import AdminMarkReadOnMount from '../_components/AdminMarkReadOnMount'
import AdminComposer from '../_components/AdminComposer'

export const metadata = { title: 'Conversation — CHIA' }
export const dynamic = 'force-dynamic'

const LESSON_TYPE_LABEL: Record<string, string> = {
  private:      'Private lesson',
  semi_private: 'Semi-private lesson',
  group:        'Group lesson',
}

function dayHeading(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })
}

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')
  if (!user.personId) redirect('/sign-in')

  const { threadId } = await params

  // Admin can view any thread regardless of participation. The loadThread
  // helper enforces participation, so we use a separate path that skips
  // that check.
  const detail = await loadThreadAsAdmin(threadId, user.personId)
  if (!detail) notFound()

  const grouped: Array<{ heading: string; items: typeof detail.messages }> = []
  for (const m of detail.messages) {
    const heading = dayHeading(m.createdAt)
    const last = grouped[grouped.length - 1]
    if (last && last.heading === heading) last.items.push(m)
    else grouped.push({ heading, items: [m] })
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <AdminMarkReadOnMount threadId={threadId} adminIsParticipant={detail.adminIsParticipant} />

      <div className="flex items-baseline gap-3">
        <Link href="/chia/messages" className="text-xs text-[#002058] hover:underline">← Messages</Link>
        <h1 className="text-base font-bold text-[#191c1e]">{detail.headerLabel}</h1>
      </div>

      <div className="space-y-4">
        {grouped.length === 0 && (
          <p className="bg-white rounded p-8 text-center text-sm text-[#8c8e98]">No messages yet.</p>
        )}

        {grouped.map((g, i) => (
          <div key={i} className="space-y-1.5">
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8c8e98]">{g.heading}</span>
            </div>
            {g.items.map(m => {
              const align = m.isViewer ? 'items-end' : 'items-start'
              const bubble = m.isViewer
                ? 'bg-[#dae2ff] text-[#002058]'        // admin viewing own message
                : m.isAdmin
                  ? 'bg-[#bee9ff] text-[#001f2a]'      // another admin's message (rare)
                  : 'bg-[#e0e3e6] text-[#191c1e]'      // regular participant message

              return (
                <div key={m.id} className={`flex flex-col ${align}`}>
                  {!m.isViewer && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8c8e98] px-1">
                      {m.senderLabel}
                    </span>
                  )}

                  {m.lessonContext && (
                    <div className="bg-[#f7f9fc] rounded-t-lg px-3 py-1 mt-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-[#8c8e98]">
                        {formatBarnDateTime(m.lessonContext.scheduledAt)} · {LESSON_TYPE_LABEL[m.lessonContext.lessonType] ?? m.lessonContext.lessonType}
                      </span>
                    </div>
                  )}

                  <div className={`max-w-[80%] px-3 py-2 ${bubble} ${m.lessonContext ? 'rounded-b-lg rounded-tr-lg' : 'rounded-lg'}`}>
                    {m.systemPrefix && (
                      <p className="text-[11px] italic text-[#444650] mb-0.5">{m.systemPrefix}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  </div>

                  <span className="text-[10px] text-[#8c8e98] px-1 mt-0.5">
                    {formatBarnTime(m.createdAt)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <AdminComposer threadId={threadId} />
    </div>
  )
}

/**
 * Admin variant of loadThread — skips the participant authorization check
 * since admin can view any thread. The "(admin)" label is preserved on
 * sender bubbles by reusing the shared helper.
 */
async function loadThreadAsAdmin(
  threadId: string,
  adminId: string,
): Promise<(Awaited<ReturnType<typeof loadThread>> & { adminIsParticipant: boolean }) | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()

  const { data: thread } = await db
    .from('thread')
    .select('id, pair_a_id, pair_b_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) return null

  // Inline the load for admin without the participant check. Mirrors
  // loadThread() body — kept separate to avoid leaking an "any viewer"
  // path into the rider/instructor UI.
  const { guardianMessageLabel, adminLabel } = await import('@/lib/messaging/displayName')

  async function labelForPerson(personId: string): Promise<{ label: string; isAdmin: boolean }> {
    const base = await guardianMessageLabel(personId)
    const { data: roles } = await db
      .from('person_role')
      .select('role')
      .eq('person_id', personId)
      .in('role', ['admin', 'barn_owner'])
      .is('deleted_at', null)
      .limit(1)
    const isAdmin = (roles ?? []).length > 0
    return { label: isAdmin ? adminLabel(base) : base, isAdmin }
  }

  const [a, b] = await Promise.all([labelForPerson(thread.pair_a_id), labelForPerson(thread.pair_b_id)])
  const headerLabel = `${a.label} ↔ ${b.label}`

  const { data: msgs } = await db
    .from('message')
    .select('id, sender_id, body, system_prefix, lesson_id, created_at')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const senderIds = [...new Set((msgs ?? []).map(m => m.sender_id))]
  const senderLabels = new Map<string, { label: string; isAdmin: boolean }>()
  await Promise.all(senderIds.map(async id => {
    senderLabels.set(id, await labelForPerson(id))
  }))

  const lessonIds = [...new Set((msgs ?? []).map(m => m.lesson_id).filter(Boolean) as string[])]
  const lessonContext = new Map<string, { scheduledAt: string; lessonType: string }>()
  if (lessonIds.length > 0) {
    const { data: lessons } = await db.from('lesson').select('id, scheduled_at, lesson_type').in('id', lessonIds)
    for (const l of lessons ?? []) lessonContext.set(l.id, { scheduledAt: l.scheduled_at, lessonType: l.lesson_type })
  }

  const messages = (msgs ?? []).map(m => {
    const meta = senderLabels.get(m.sender_id) ?? { label: '—', isAdmin: false }
    return {
      id: m.id,
      senderId: m.sender_id,
      senderLabel: meta.label,
      isViewer: m.sender_id === adminId,
      isAdmin: meta.isAdmin,
      body: m.body,
      systemPrefix: m.system_prefix,
      lessonId: m.lesson_id,
      lessonContext: m.lesson_id ? lessonContext.get(m.lesson_id) ?? null : null,
      createdAt: m.created_at,
    }
  })

  // Has the admin posted before? Used to decide whether to fire markRead.
  const { data: part } = await db
    .from('thread_participant')
    .select('id')
    .eq('thread_id', threadId)
    .eq('person_id', adminId)
    .maybeSingle()

  return {
    threadId,
    headerLabel,
    messages,
    adminIsParticipant: !!part,
  }
}
