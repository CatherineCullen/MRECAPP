'use client'

import Link from 'next/link'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', co_owner: 'Co-owner', lessee: 'Lessee',
  guardian: 'Guardian', trainer: 'Trainer', emergency: 'Emergency',
  vet: 'Vet', farrier: 'Farrier', other: 'Other',
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-[#b7f0d0] text-[#1a6b3c]',
  pending:  'bg-[#ffddb3] text-[#7c4b00]',
  away:     'bg-[#e8edf4] text-[#444650]',
  archived: 'bg-[#e8edf4] text-[#c4c6d1]',
}

export default function PersonHorsesSection({
  horseLinks,
  personId,
}: {
  horseLinks: any[]
  personId:   string
}) {
  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Horses</h2>
        <Link
          href={`/chia/people/${personId}/horses/new`}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
        >
          + Link horse
        </Link>
      </div>

      {horseLinks.length === 0 ? (
        <div className="px-4 py-3 text-sm text-[#444650]">No horses linked.</div>
      ) : (
        <div className="divide-y divide-[#f2f4f7]">
          {horseLinks.map((hc: any) => {
            const horse = hc.horse
            return (
              <div key={hc.id} className="px-4 py-3 flex items-center gap-4">
                <Link
                  href={`/chia/herd/horses/${horse.id}`}
                  className="font-semibold text-[#191c1e] hover:text-[#002058] text-sm"
                >
                  {horse.barn_name}
                </Link>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${STATUS_COLORS[horse.status] ?? 'bg-[#e8edf4] text-[#444650]'}`}>
                  {horse.status}
                </span>
                <span className="text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {ROLE_LABELS[hc.role] ?? hc.role}
                </span>
                {hc.is_billing_contact && (
                  <span className="text-[10px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded uppercase tracking-wider">Billing</span>
                )}
                {hc.receives_health_alerts && (
                  <span className="text-[10px] font-semibold bg-[#b7f0d0] text-[#1a6b3c] px-1.5 py-0.5 rounded uppercase tracking-wider">Health alerts</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
