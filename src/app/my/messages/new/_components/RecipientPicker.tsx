'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { openThreadWith } from '../../actions'
import type { EligibleRecipient } from '@/lib/messaging/eligibility'

export default function RecipientPicker({ recipients }: { recipients: EligibleRecipient[] }) {
  const [query, setQuery] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter(r => r.label.toLowerCase().includes(q))
  }, [recipients, query])

  function pick(personId: string) {
    start(async () => {
      // Server action redirects to the thread URL.
      await openThreadWith({ recipientId: personId })
    })
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search…"
        className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface placeholder-on-surface-muted/60 focus:outline-none"
        autoFocus
      />

      <div className="bg-surface-lowest rounded-lg overflow-hidden">
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-on-surface-muted">No matches.</p>
        )}
        {filtered.map(r => (
          <button
            key={r.personId}
            type="button"
            onClick={() => pick(r.personId)}
            disabled={pending}
            className="w-full text-left flex items-baseline px-4 py-2.5 hover:bg-surface-low transition-colors disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-on-surface flex-1 truncate">{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
