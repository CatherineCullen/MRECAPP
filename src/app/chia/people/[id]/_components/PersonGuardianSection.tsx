'use client'

import Link from 'next/link'

export default function PersonGuardianSection({
  person,
  guardian,
  minors,
}: {
  person:   any
  guardian: any
  minors:   any[]
}) {
  if (!guardian && minors.length === 0) return null

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7]">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          {person.is_minor ? 'Guardian' : 'Minor Children'}
        </h2>
      </div>
      <div className="px-4 py-3 space-y-2 text-sm">
        {/* Guardian link for minors */}
        {guardian && (
          <div className="flex items-center gap-3">
            <Link href={`/chia/people/${guardian.id}`} className="font-semibold text-[#191c1e] hover:text-[#002058]">
              {guardian.first_name} {guardian.last_name}
            </Link>
            {guardian.email && <span className="text-[#444650]">{guardian.email}</span>}
            {guardian.phone && <span className="text-[#444650]">{guardian.phone}</span>}
          </div>
        )}

        {/* Minors for this guardian */}
        {minors.map(minor => (
          <div key={minor.id} className="flex items-center gap-3">
            <Link href={`/chia/people/${minor.id}`} className="font-semibold text-[#191c1e] hover:text-[#002058]">
              {minor.first_name} {minor.last_name}
            </Link>
            <span className="text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider">Minor</span>
          </div>
        ))}
      </div>
    </section>
  )
}
