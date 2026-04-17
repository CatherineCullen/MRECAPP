'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolveCarePlan } from '../care-plans/actions'

type Plan = {
  id:              string
  content:         string
  starts_on:       string | null
  ends_on:         string | null
  resolved_at:     string | null
  resolution_note: string | null
  source_quote:    string | null
  person:          { first_name: string; last_name: string } | null
  resolved_by_person?: { first_name: string; last_name: string } | null
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ActivePlanCard({ plan, horseId }: { plan: Plan; horseId: string }) {
  const router = useRouter()
  const [resolving,  setResolving]  = useState(false)
  const [note,       setNote]       = useState('')
  const [isPending,  startTransition] = useTransition()

  function handleResolve() {
    startTransition(async () => {
      await resolveCarePlan(plan.id, horseId, note || null)
      router.refresh()
    })
  }

  const addedBy = plan.person ? `${plan.person.first_name} ${plan.person.last_name}` : null
  const indefinite = !plan.ends_on

  return (
    <div className="border border-[#ffddb3] bg-[#fffbf5] rounded p-3">
      <div className="text-sm text-[#191c1e] whitespace-pre-wrap">{plan.content}</div>

      {plan.source_quote && (
        <div className="mt-1 text-xs text-[#444650] italic">"{plan.source_quote}"</div>
      )}

      <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-[#444650]">
        {plan.starts_on && <span>Started {formatDate(plan.starts_on)}</span>}
        {plan.ends_on
          ? <span className="text-[#7c4b00]">Ends {formatDate(plan.ends_on)}</span>
          : <span className="text-[#7c4b00] font-semibold">No end date</span>
        }
        {addedBy && <span>Added by {addedBy}</span>}
      </div>

      {/* Resolve */}
      {!resolving ? (
        <button
          onClick={() => setResolving(true)}
          className="mt-2 text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
        >
          Resolve
        </button>
      ) : (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Resolution note (optional)…"
            rows={2}
            className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380] resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleResolve}
              disabled={isPending}
              className="text-[10px] font-semibold text-white bg-[#444650] hover:bg-[#191c1e] px-2.5 py-1 rounded disabled:opacity-60"
            >
              {isPending ? 'Resolving…' : 'Confirm resolve'}
            </button>
            <button
              onClick={() => { setResolving(false); setNote('') }}
              className="text-[10px] text-[#444650] hover:text-[#191c1e]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ResolvedPlanCard({ plan }: { plan: Plan }) {
  const resolvedBy = plan.resolved_by_person
    ? `${plan.resolved_by_person.first_name} ${plan.resolved_by_person.last_name}`
    : null

  return (
    <div className="border border-[#e0e3e6] bg-[#f7f9fc] rounded p-3 opacity-75">
      <div className="text-sm text-[#444650] whitespace-pre-wrap line-through decoration-[#c4c6d1]">{plan.content}</div>
      {plan.resolution_note && (
        <div className="mt-1 text-xs text-[#444650]">Note: {plan.resolution_note}</div>
      )}
      <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-[#444650]">
        {plan.starts_on && <span>Started {formatDate(plan.starts_on)}</span>}
        {plan.resolved_at && <span>Resolved {formatDateTime(plan.resolved_at)}</span>}
        {resolvedBy && <span>by {resolvedBy}</span>}
      </div>
    </div>
  )
}

export default function HorseCarePlansSection({
  plans,
  resolvedPlans,
  horseId,
}: {
  plans:         Plan[]
  resolvedPlans: Plan[]
  horseId:       string
}) {
  const [showHistory, setShowHistory] = useState(false)

  return (
    <div>
      {/* Sub-header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">
          Temporary Care Plans
          {plans.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold bg-[#ffddb3] text-[#7c4b00] px-1.5 py-0.5 rounded">
              {plans.length}
            </span>
          )}
        </span>
        <Link
          href={`/chia/herd/horses/${horseId}/care-plans/new`}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
        >
          + Add
        </Link>
      </div>

      {/* Active plans */}
      {plans.length === 0 ? (
        <div className="px-4 pb-3 text-sm text-[#444650]">No active temporary care plans.</div>
      ) : (
        <div className="px-4 pb-3 space-y-2">
          {plans.map(plan => (
            <ActivePlanCard key={plan.id} plan={plan} horseId={horseId} />
          ))}
        </div>
      )}

      {/* History toggle */}
      {resolvedPlans.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-[10px] font-semibold text-[#444650] hover:text-[#191c1e] uppercase tracking-wider"
          >
            {showHistory ? 'Hide history' : `View history (${resolvedPlans.length})`}
          </button>

          {showHistory && (
            <div className="mt-2 space-y-2">
              {resolvedPlans.map(plan => (
                <ResolvedPlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
