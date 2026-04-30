import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { loadAllThreadsForAdmin } from '@/lib/messaging/inbox'
import { formatBarnDateTime } from '@/lib/datetime'
import AdminInboxFilter from './_components/AdminInboxFilter'

export const metadata = { title: 'Messages — CHIA' }
export const dynamic = 'force-dynamic'

export default async function AdminMessagesPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')
  if (!user.personId) redirect('/sign-in')

  const rows = await loadAllThreadsForAdmin(user.personId)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#191c1e]">Messages</h1>
          <p className="text-xs text-[#8c8e98] mt-0.5">
            All threads across the barn. Posting in any thread joins you as a participant — your name will appear with an (admin) tag and the other participants will see your message.
          </p>
        </div>
        <Link
          href="/chia/messages/new"
          className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540]"
        >
          + New message
        </Link>
      </div>

      <AdminInboxFilter rows={rows.map(r => ({
        threadId:          r.threadId,
        participantsLabel: r.participantsLabel,
        preview:           r.preview,
        lastActivityLabel: formatBarnDateTime(r.lastActivityAt),
        unread:            r.unread,
        searchKey:         r.searchKey,
      }))} />
    </div>
  )
}
