'use client'

import Link from 'next/link'

const ROLE_LABELS: Record<string, string> = {
  owner:         'Owner',
  co_owner:      'Co-owner',
  lessee:        'Lessee',
  guardian:      'Guardian',
  trainer:       'Trainer',
  emergency:     'Emergency',
  vet:           'Vet',
  farrier:       'Farrier',
  other:         'Other',
}

export default function HorseContactsSection({ contacts, horseId }: { contacts: any[], horseId: string }) {
  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Contacts</h2>
        <Link
          href={`/chia/herd/horses/${horseId}/contacts/new`}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
        >
          + Add
        </Link>
      </div>

      {contacts.length === 0 ? (
        <div className="px-4 py-3 text-sm text-[#444650]">No contacts on file.</div>
      ) : (
        <div className="divide-y divide-[#f2f4f7]">
          {contacts.map((hc) => {
            const p = hc.person
            const roleLabel = ROLE_LABELS[hc.role] ?? hc.role

            return (
              <div key={hc.id} className="px-4 py-3 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/chia/people/${p.id}`}
                      className="text-sm font-semibold text-[#191c1e] hover:text-[#002058]"
                    >
                      {p.first_name} {p.last_name}
                    </Link>
                    <span className="text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider">
                      {roleLabel}
                    </span>
                    {hc.is_billing_contact && (
                      <span className="text-[10px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Billing
                      </span>
                    )}
                    {hc.receives_health_alerts && (
                      <span className="text-[10px] font-semibold bg-[#b7f0d0] text-[#1a6b3c] px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Health alerts
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-[#444650] flex-wrap">
                    {p.email && <a href={`mailto:${p.email}`} className="hover:text-[#002058]">{p.email}</a>}
                    {p.phone && <span>{p.phone}</span>}
                  </div>
                </div>

                {hc.can_log_in && (
                  <span className="shrink-0 text-[10px] font-semibold text-[#444650]">Has login</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
