import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { eligibleRecipientsFor } from '@/lib/messaging/eligibility'
import AdminRecipientPicker from '../_components/AdminRecipientPicker'

export const metadata = { title: 'New Message — CHIA' }
export const dynamic = 'force-dynamic'

export default async function AdminNewMessagePage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')
  if (!user.personId) redirect('/sign-in')

  // Admin viewer → eligibleRecipientsFor returns every active non-self person.
  const recipients = await eligibleRecipientsFor(user.personId)

  return (
    <div className="p-6 max-w-xl space-y-4">
      <div className="flex items-baseline gap-3">
        <Link href="/chia/messages" className="text-xs text-[#002058] hover:underline">← Messages</Link>
        <h1 className="text-base font-bold text-[#191c1e]">New message</h1>
      </div>

      {recipients.length === 0 ? (
        <p className="bg-white rounded p-8 text-center text-sm text-[#8c8e98]">No eligible recipients.</p>
      ) : (
        <AdminRecipientPicker recipients={recipients} />
      )}
    </div>
  )
}
