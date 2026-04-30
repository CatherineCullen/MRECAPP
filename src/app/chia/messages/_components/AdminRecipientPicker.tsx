'use client'

import { useMemo, useState, useTransition } from 'react'
import { adminOpenThreadWith } from '../actions'
import type { EligibleRecipient } from '@/lib/messaging/eligibility'

export default function AdminRecipientPicker({ recipients }: { recipients: EligibleRecipient[] }) {
  const [query, setQuery] = useState('')
  const [pending, start] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter(r => r.label.toLowerCase().includes(q))
  }, [recipients, query])

  function pick(personId: string) {
    start(async () => { await adminOpenThreadWith(personId) })
  }

  return (
    <>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search…"
        className="w-full border border-[#c4c6d1] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white"
        autoFocus
      />

      <div className="bg-white rounded border border-[#c4c6d1]/40 divide-y divide-[#e8ecf5] max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[#8c8e98]">No matches.</p>
        ) : (
          filtered.map(r => (
            <button
              key={r.personId}
              type="button"
              onClick={() => pick(r.personId)}
              disabled={pending}
              className="w-full text-left flex items-baseline px-4 py-2 hover:bg-[#fafbfd] transition-colors disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-[#191c1e] flex-1 truncate">{r.label}</span>
            </button>
          ))
        )}
      </div>
    </>
  )
}
