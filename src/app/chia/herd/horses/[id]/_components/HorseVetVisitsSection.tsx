'use client'

import { useState } from 'react'

type VetVisit = {
  id:         string
  visit_date: string
  vet_name:   string | null
  findings:   string | null
  document:   { id: string; filename: string } | null
}

export default function HorseVetVisitsSection({ visits }: { visits: VetVisit[] }) {
  const [expanded, setExpanded] = useState(false)

  const preview   = visits[0]
  const rest      = visits.slice(1)
  const hasMore   = rest.length > 0

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  function VisitRow({ visit }: { visit: VetVisit }) {
    return (
      <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[#f2f4f7] last:border-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-[#191c1e]">{formatDate(visit.visit_date)}</span>
            {visit.vet_name && <span className="text-xs text-[#444650]">{visit.vet_name}</span>}
          </div>
          {visit.findings && (
            <p className="mt-0.5 text-xs text-[#444650] line-clamp-2">{visit.findings}</p>
          )}
        </div>
        {visit.document && (
          <a
            href={`/api/documents/${visit.document.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold text-[#056380] hover:text-[#002058] whitespace-nowrap"
          >
            View PDF →
          </a>
        )}
      </div>
    )
  }

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Vet Records
          <span className="ml-1.5 text-[10px] font-normal text-[#444650] normal-case tracking-normal">({visits.length})</span>
        </h2>
      </div>
      <div className="px-4 pt-1 pb-2">
        <VisitRow visit={preview} />
        {hasMore && expanded && rest.map(v => <VisitRow key={v.id} visit={v} />)}
        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            {expanded ? 'Show less' : `Show ${rest.length} more`}
          </button>
        )}
      </div>
    </section>
  )
}
