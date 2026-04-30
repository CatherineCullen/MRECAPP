import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { eligibleRecipientsFor } from '@/lib/messaging/eligibility'
import RecipientPicker from './_components/RecipientPicker'

export const metadata = { title: 'New Message — Marlboro Ridge Equestrian Center' }
export const dynamic = 'force-dynamic'

export default async function NewMessagePage() {
  const user = await getCurrentUser()
  if (!user?.personId) redirect('/sign-in')

  const recipients = await eligibleRecipientsFor(user.personId)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <Link href="/my/messages" className="text-xs text-secondary hover:text-primary">← Messages</Link>
        <h1 className="text-base font-bold text-on-surface">New message</h1>
      </div>

      {recipients.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-on-surface-muted">No one to message yet.</p>
          <p className="text-xs text-on-surface-muted mt-1">
            Once you've had a lesson scheduled, your instructor will appear here.
          </p>
        </div>
      ) : (
        <RecipientPicker recipients={recipients} />
      )}
    </div>
  )
}
