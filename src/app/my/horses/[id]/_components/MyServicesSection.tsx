'use client'

import { useState } from 'react'

export type ServiceLogEntry = {
  id:           string
  logged_at:    string
  unit_price:   number | null
  is_billable:  boolean
  notes:        string | null
  service_name: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPrice(dollars: number | null) {
  if (dollars == null) return null
  return `$${Number(dollars).toFixed(2)}`
}

export default function MyServicesSection({ entries }: { entries: ServiceLogEntry[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          Services Log
          {entries.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold text-on-surface-muted normal-case tracking-normal">
              ({entries.length})
            </span>
          )}
        </h2>
        <span className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {entries.length === 0 && (
            <p className="text-sm text-on-surface-muted">No services logged in the last 12 months.</p>
          )}
          {entries.map(e => {
            const price = e.is_billable ? formatPrice(e.unit_price) : null
            return (
              <div key={e.id} className="py-1.5 border-t border-outline first:border-t-0">
                <div className="flex items-baseline gap-3">
                  <div className="shrink-0 text-[11px] text-on-surface-muted tabular-nums">
                    {formatDate(e.logged_at)}
                  </div>
                  <span className="text-sm text-on-surface flex-1 min-w-0 truncate">{e.service_name}</span>
                  {price && <span className="text-[11px] font-semibold text-on-surface shrink-0 tabular-nums">{price}</span>}
                </div>
                {e.notes && <p className="mt-0.5 text-[11px] text-on-surface-muted">{e.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
