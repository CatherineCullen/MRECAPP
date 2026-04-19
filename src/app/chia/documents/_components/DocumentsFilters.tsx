'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition, useEffect } from 'react'
import { DOCUMENT_TYPES } from '../_lib/documentTypes'

// URL-driven filters: type + search. Keeps state in the URL so back/forward
// and shared links work. Matches the pattern used by PeopleFilters.

export default function DocumentsFilters({
  selectedType,
  initialSearch,
}: {
  selectedType: string
  initialSearch: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [search, setSearch] = useState(initialSearch)
  const [, startTransition] = useTransition()

  // Debounce search to avoid thrashing the router on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (search.trim()) next.set('q', search.trim())
      else next.delete('q')
      startTransition(() => router.replace(`${pathname}?${next.toString()}`))
    }, 250)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function setType(t: string) {
    const next = new URLSearchParams(params.toString())
    if (t === 'all') next.delete('type')
    else next.set('type', t)
    startTransition(() => router.replace(`${pathname}?${next.toString()}`))
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setType('all')}
          className={`text-xs px-2.5 py-1 rounded ${
            selectedType === 'all'
              ? 'bg-[#002058] text-white font-semibold'
              : 'text-[#444650] hover:bg-[#e8edf4]'
          }`}
        >
          All
        </button>
        {DOCUMENT_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`text-xs px-2.5 py-1 rounded ${
              selectedType === t
                ? 'bg-[#002058] text-white font-semibold'
                : 'text-[#444650] hover:bg-[#e8edf4]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder="Search filename / notes…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="border border-[#c4c6d1] rounded px-2 py-1 text-xs w-56"
      />
    </div>
  )
}
