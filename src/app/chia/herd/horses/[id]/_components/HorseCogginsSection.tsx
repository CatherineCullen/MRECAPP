'use client'

import Link from 'next/link'

export default function HorseCogginsSection({ coggins, horseId }: { coggins: any, horseId: string }) {
  if (!coggins) {
    return (
      <section className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Coggins</h2>
          <Link
            href={`/chia/herd/import?horse_id=${horseId}`}
            className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
          >
            + Add
          </Link>
        </div>
        <div className="px-4 py-3 text-sm text-[#444650]">No Coggins on file.</div>
      </section>
    )
  }

  const drawn    = coggins.date_drawn  ? new Date(coggins.date_drawn  + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const expiry   = coggins.expiry_date ? new Date(coggins.expiry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const expired  = coggins.expiry_date && new Date(coggins.expiry_date) < new Date()

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Coggins</h2>
        <Link
          href={`/chia/herd/import?horse_id=${horseId}`}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
        >
          + Add
        </Link>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-8 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Date Drawn</div>
            <div className="text-sm text-[#191c1e] font-medium">{drawn}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Expires</div>
            <div className={`text-sm font-medium ${expired ? 'text-[#b00020]' : 'text-[#191c1e]'}`}>
              {expiry}
              {expired && <span className="ml-1.5 text-[10px] font-semibold bg-[#ffdad6] text-[#b00020] px-1.5 py-0.5 rounded uppercase tracking-wider">Expired</span>}
            </div>
          </div>
          {coggins.vet_name && (
            <div>
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Vet</div>
              <div className="text-sm text-[#191c1e]">{coggins.vet_name}</div>
            </div>
          )}
          {coggins.document_id && (
            <div className="ml-auto">
              <a
                href={`/api/documents/${coggins.document_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
              >
                View document →
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
