'use client'

import { useTransition } from 'react'
import { adminOpenThreadWith } from '@/app/chia/messages/actions'

/**
 * Admin shortcut on Person detail. Opens (or creates) the admin↔person
 * thread and lands on the conversation. Hidden for: people without a
 * login (no inbox to read into) and the admin's own page.
 */
export default function MessagePersonButton({ personId }: { personId: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      onClick={() => start(async () => { await adminOpenThreadWith(personId) })}
      disabled={pending}
      className="text-xs font-semibold text-[#056380] hover:text-[#002058] disabled:opacity-50"
    >
      {pending ? 'Opening…' : 'Message'}
    </button>
  )
}
