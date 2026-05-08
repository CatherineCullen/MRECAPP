import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { loadInboxForPerson } from '@/lib/messaging/inbox'
import { formatBarnDateTime, formatBarnTime, formatBarnDate } from '@/lib/datetime'

export const metadata = { title: 'Messages — Marlboro Ridge Equestrian Center' }
export const dynamic = 'force-dynamic'

/** Compact relative-ish timestamp: time today, weekday this week, date older. */
function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return formatBarnTime(d)
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
  return formatBarnDate(d)
}

export default async function MessagesPage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const rows = await loadInboxForPerson(user.personId)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="text-base font-bold text-on-surface">Messages</h1>
        <Link
          href="/my/messages/new"
          className="text-xs font-semibold text-secondary uppercase tracking-wider hover:text-primary"
        >
          + New
        </Link>
      </div>

      <div className="bg-surface-highest/40 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface-muted">
        Administrative staff can view and respond to all messages.
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-on-surface-muted">No conversations yet.</p>
          <p className="text-xs text-on-surface-muted mt-1">
            Start one with the <span className="font-semibold">+ New</span> button.
          </p>
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-lg overflow-hidden">
          {rows.map(row => (
            <Link
              key={row.threadId}
              href={`/my/messages/${row.threadId}`}
              className="flex items-baseline gap-2 px-4 py-2.5 hover:bg-surface-low transition-colors"
              title={formatBarnDateTime(row.lastActivityAt)}
            >
              {row.unread && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" aria-label="Unread" />}
              <div className={`flex-1 min-w-0 ${row.unread ? '' : 'pl-4'}`}>
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm truncate ${row.unread ? 'font-bold text-on-surface' : 'font-semibold text-on-surface'}`}>
                    {row.headerLabel}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-muted flex-shrink-0">
                    {timeLabel(row.lastActivityAt)}
                  </span>
                </div>
                {row.preview && (
                  <p className={`text-xs truncate ${row.unread ? 'text-on-surface' : 'text-on-surface-muted'}`}>
                    {row.preview}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
