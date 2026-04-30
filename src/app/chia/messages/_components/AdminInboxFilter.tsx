'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export interface AdminInboxRowDTO {
  threadId:          string
  participantsLabel: string
  preview:           string
  lastActivityLabel: string
  unread:            boolean
  searchKey:         string
}

export default function AdminInboxFilter({ rows }: { rows: AdminInboxRowDTO[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.searchKey.includes(q))
  }, [rows, query])

  return (
    <>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter by participant name…"
        className="w-full max-w-sm border border-[#c4c6d1] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#002058] bg-white"
      />

      {filtered.length === 0 ? (
        <div className="bg-white rounded p-8 text-center text-sm text-[#8c8e98]">
          {query ? 'No threads match.' : 'No threads yet.'}
        </div>
      ) : (
        <div className="bg-white rounded border border-[#c4c6d1]/40 divide-y divide-[#e8ecf5]">
          {filtered.map(r => (
            <Link
              key={r.threadId}
              href={`/chia/messages/${r.threadId}`}
              className="block px-4 py-3 hover:bg-[#fafbfd] transition-colors"
            >
              <div className="flex items-baseline gap-3">
                {r.unread && <span className="w-2 h-2 rounded-full bg-[#002058] flex-shrink-0" aria-label="Unread" />}
                <span className={`text-sm flex-1 truncate ${r.unread ? 'font-bold text-[#191c1e]' : 'font-semibold text-[#191c1e]'}`}>
                  {r.participantsLabel}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[#8c8e98] flex-shrink-0">
                  {r.lastActivityLabel}
                </span>
              </div>
              {r.preview && (
                <p className="text-xs text-[#444650] mt-0.5 truncate pl-5">{r.preview}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
