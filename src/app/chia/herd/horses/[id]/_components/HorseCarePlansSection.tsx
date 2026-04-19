'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ActivePlanCard, ResolvedPlanCard, type CarePlan } from '../../../_components/CarePlanCard'

export default function HorseCarePlansSection({
  plans,
  resolvedPlans,
  horseId,
}: {
  plans:         CarePlan[]
  resolvedPlans: CarePlan[]
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
