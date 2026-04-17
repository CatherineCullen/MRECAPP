'use client'

import { useState } from 'react'
import type { QueueSnapshot, HorseGroup, BoardServiceOption } from '../_lib/loadQueue'
import AllocateRow from './AllocateRow'
import AddChargeForm from './AddChargeForm'
import AddServiceForm from './AddServiceForm'
import GenerateInvoices from './GenerateInvoices'

/**
 * Review & Allocate view. Per-horse panels list open BillingLineItems with
 * type, description, amount, and status chip. Each panel has its own
 * "+ Service" and "+ Charge" buttons so admin can add entries right where
 * their eye is; the top-level "Add charge to multiple horses" stays for
 * the wormer-style fan-out case.
 */

function fmt(n: number): string {
  // Credits display as "(45.00)" following the accounting convention.
  const abs = Math.abs(n).toFixed(2)
  return n < 0 ? `($${abs})` : `$${abs}`
}

function HorsePanel({
  group,
  services,
  userLabel,
}: {
  group:     HorseGroup
  services:  BoardServiceOption[]
  userLabel: string
}) {
  const [addingService, setAddingService] = useState(false)
  const [addingCharge,  setAddingCharge]  = useState(false)

  const contactLabel = group.billingContacts.length === 1
    ? group.billingContacts[0].label
    : `${group.billingContacts.length} contacts: ${group.billingContacts.map(c => c.label).join(', ')}`

  return (
    <section className="bg-white rounded border border-[#c4c6d1]/40">
      <header className="flex items-baseline gap-3 px-4 py-2.5 bg-[#f7f9fc] rounded-t border-b border-[#c4c6d1]/40">
        <h3 className="text-[#191c1e] font-semibold text-sm">{group.barnName}</h3>
        <span className="text-xs text-[#8c8e98] truncate flex-1">{contactLabel}</span>
        <button
          type="button"
          onClick={() => { setAddingService(v => !v); setAddingCharge(false) }}
          className="text-[11px] font-semibold text-[#002058] hover:underline"
        >
          + Service
        </button>
        <button
          type="button"
          onClick={() => { setAddingCharge(v => !v); setAddingService(false) }}
          className="text-[11px] font-semibold text-[#002058] hover:underline"
        >
          + Charge
        </button>
        <span className="font-mono text-sm text-[#191c1e]">{fmt(group.subtotal)}</span>
      </header>

      {addingService && (
        <AddServiceForm
          horseId={group.horseId}
          horseName={group.barnName}
          services={services}
          userLabel={userLabel}
          onDone={() => setAddingService(false)}
        />
      )}

      {addingCharge && (
        <AddChargeForm
          horseGroups={[group]}
          scopedHorseId={group.horseId}
          onDone={() => setAddingCharge(false)}
        />
      )}

      {group.items.length === 0 ? (
        <div className="px-4 py-3 text-xs text-[#8c8e98]">
          No open charges. Use the buttons above to log a service or add a charge.
        </div>
      ) : (
        <div>
          {group.items.map(item => (
            <AllocateRow
              key={item.id}
              item={item}
              billingContacts={group.billingContacts}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function QueueView({
  snapshot,
  userLabel,
}: {
  snapshot:  QueueSnapshot
  userLabel: string
}) {
  const { horseGroups, totalDraft, totalReviewed, monthlyBoardUnitPrice, services } = snapshot

  if (monthlyBoardUnitPrice === null) {
    return (
      <div className="p-6">
        <div className="max-w-xl p-4 bg-[#fef3e7] border border-[#f3a712]/40 rounded text-sm text-[#7a5408]">
          <strong>Monthly Board isn&rsquo;t configured.</strong>
          <p className="mt-1">
            Go to Service Catalog and set up the recurring Monthly Board rate.
            Without it, the billing queue can&rsquo;t seed board charges for
            your boarders.
          </p>
        </div>
      </div>
    )
  }

  if (horseGroups.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-xl p-4 text-sm text-[#444650]">
          No active horses have billing contacts yet. Once a horse has at
          least one billing contact, Monthly Board will seed here
          automatically.
        </div>
      </div>
    )
  }

  const grandTotal = totalDraft + totalReviewed

  return (
    <div className="p-6 space-y-4">
      {/* Summary strip */}
      <div className="flex items-center gap-6 px-4 py-3 bg-white rounded border border-[#c4c6d1]/40">
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Draft</div>
          <div className="font-mono text-base text-[#191c1e]">{fmt(totalDraft)}</div>
        </div>
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Reviewed</div>
          <div className="font-mono text-base text-[#002058] font-semibold">{fmt(totalReviewed)}</div>
        </div>
        <div className="h-8 w-px bg-[#c4c6d1]/60" />
        <div>
          <div className="text-xs text-[#8c8e98] uppercase tracking-wide">Queue total</div>
          <div className="font-mono text-base text-[#191c1e] font-semibold">{fmt(grandTotal)}</div>
        </div>
        <div className="flex-1" />
        <div className="text-xs text-[#8c8e98] mr-4">
          {horseGroups.length} horse{horseGroups.length === 1 ? '' : 's'}
        </div>
        <GenerateInvoices totalReviewed={totalReviewed} />
      </div>

      {/* Bulk charge entry — wormer case */}
      <AddChargeForm horseGroups={horseGroups} />

      {/* Per-horse panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {horseGroups.map(group => (
          <HorsePanel
            key={group.horseId}
            group={group}
            services={services}
            userLabel={userLabel}
          />
        ))}
      </div>
    </div>
  )
}
