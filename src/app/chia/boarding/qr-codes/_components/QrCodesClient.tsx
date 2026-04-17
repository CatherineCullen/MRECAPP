'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CopyUrlButton from './CopyUrlButton'
import NewProviderQrForm, { type PersonOption, type ServiceOption } from './NewProviderQrForm'
import { setProviderQrActive } from '../actions'

/** One QR in either table. `kind` distinguishes routing. */
export type QrRow = {
  kind:      's' | 'p'
  id:        string                // service.id (s) or provider_qr_code.id (p)
  primary:   string
  secondary: string | null
  url:       string
  active:    boolean
  canToggle: boolean               // per-service rows are controlled via Service Catalog
}

type Props = {
  serviceRows:  QrRow[]
  providerRows: QrRow[]
  providers:    PersonOption[]
  services:     ServiceOption[]
}

/** Namespaced key so service IDs and provider-QR IDs don't collide. */
const keyOf = (r: QrRow) => `${r.kind}:${r.id}`

export default function QrCodesClient({ serviceRows, providerRows, providers, services }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(k: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else             next.add(k)
      return next
    })
  }

  // Build print URL: comma-separated namespaced keys. Keeps it one round-trip.
  const printHref = selected.size > 0
    ? `/print/qr?keys=${encodeURIComponent(Array.from(selected).join(','))}`
    : null

  return (
    <div className="p-6 max-w-5xl">
      {/* Sticky-feel action bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#444650]">
          Select which codes to include on a printable grid. Deactivated codes cannot be selected.
        </p>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-[#444650] px-2 py-1 rounded hover:bg-[#e8eaf0]"
            >
              Clear
            </button>
          )}
          {printHref ? (
            <Link
              href={printHref}
              target="_blank"
              className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099]"
            >
              Print selected ({selected.size})
            </Link>
          ) : (
            <button
              disabled
              className="bg-[#c4c6d1] text-white text-xs font-semibold px-3 py-1.5 rounded cursor-not-allowed"
            >
              Print selected (0)
            </button>
          )}
        </div>
      </div>

      <QrTable
        heading="Per-service codes"
        subheading="One per active a la carte service. Barn workers scan to log; active state follows the Service Catalog."
        rows={serviceRows}
        selected={selected}
        onToggle={toggle}
        emptyState="No active a la carte services — add some in the Service Catalog."
      />

      <QrTable
        heading="Per-provider codes"
        subheading="One per external provider. Provider must be a Person with the Service Provider role."
        rows={providerRows}
        selected={selected}
        onToggle={toggle}
        emptyState="No provider codes yet. Create one below."
        footer={<NewProviderQrForm providers={providers} services={services} />}
      />
    </div>
  )
}

function QrTable({
  heading, subheading, rows, selected, onToggle, emptyState, footer,
}: {
  heading:     string
  subheading:  string
  rows:        QrRow[]
  selected:    Set<string>
  onToggle:    (k: string) => void
  emptyState:  string
  footer?:     React.ReactNode
}) {
  return (
    <section className="bg-white rounded-lg border border-[#c4c6d1]/40 mb-6 overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7] border-b border-[#c4c6d1]/30">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">{heading}</h2>
        <p className="text-[11px] text-[#444650] mt-0.5">{subheading}</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
            <th className="py-1.5 px-3 w-8" />
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase">Label</th>
            <th className="py-1.5 px-3 text-left text-[10px] font-semibold text-[#444650] uppercase w-28">URL</th>
            <th className="py-1.5 px-3 text-right text-[10px] font-semibold text-[#444650] uppercase w-64">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="py-4 px-3 text-xs text-[#c4c6d1] italic">{emptyState}</td></tr>
          )}
          {rows.map(r => {
            const k = keyOf(r)
            return <Row key={k} r={r} k={k} selected={selected.has(k)} onToggle={onToggle} />
          })}
        </tbody>
      </table>
      {footer}
    </section>
  )
}

function Row({ r, k, selected, onToggle }: { r: QrRow; k: string; selected: boolean; onToggle: (k: string) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggleActive() {
    setError(null)
    startTransition(async () => {
      const res = await setProviderQrActive(r.id, !r.active)
      if (res.error) setError(res.error)
      else           router.refresh()
    })
  }

  const disabled = !r.active
  return (
    <tr className={`border-b border-[#c4c6d1]/30 ${r.active ? '' : 'opacity-50'}`}>
      <td className="py-1.5 px-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={() => onToggle(k)}
          className="accent-[#002058]"
        />
      </td>
      <td className="py-1.5 px-3 text-xs text-[#191c1e]">
        <div className="font-semibold">{r.primary}</div>
        {r.secondary && <div className="text-[10px] text-[#444650]">{r.secondary}</div>}
      </td>
      <td className="py-1.5 px-3">
        <CopyUrlButton url={r.url} />
      </td>
      <td className="py-1.5 px-3 text-right whitespace-nowrap">
        {r.canToggle ? (
          <button
            onClick={toggleActive}
            disabled={pending}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors disabled:opacity-50 ${
              r.active
                ? 'text-[#8a1a1a] hover:bg-[#ffd6d6]/30'
                : 'text-[#1a6b3c] hover:bg-[#b7f0d0]/40'
            }`}
          >
            {r.active ? 'Deactivate' : 'Reactivate'}
          </button>
        ) : (
          <span className="text-[10px] text-[#444650] italic">
            {r.active ? 'Active' : 'Inactive'} · Service Catalog
          </span>
        )}
        {error && <div className="text-[10px] text-red-700 mt-0.5">{error}</div>}
      </td>
    </tr>
  )
}
