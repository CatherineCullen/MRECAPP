'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addCarePlan } from '../../actions'

export default function AddCarePlanForm({ horseId }: { horseId: string }) {
  const [isPending, startTransition] = useTransition()
  const [isFeedroomMed, setIsFeedroomMed] = useState(false)
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await addCarePlan(horseId, fd)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
          Instructions <span className="text-[#b00020]">*</span>
        </label>
        <textarea
          name="content"
          required
          rows={4}
          placeholder="e.g. Bute 1g twice daily until recheck. Keep in paddock only — no arena work."
          className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
        />
        <p className="mt-1 text-[10px] text-[#444650]">
          Required even if the AM/PM dose below covers the same info — extra context helps.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
            Starts on
          </label>
          <input
            type="date"
            name="starts_on"
            className="w-full border border-[#c4c6d1] rounded px-3 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
            Ends on
          </label>
          <input
            type="date"
            name="ends_on"
            className="w-full border border-[#c4c6d1] rounded px-3 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
          />
          <p className="mt-0.5 text-[10px] text-[#444650]">Leave blank if open-ended — it'll be flagged on the record.</p>
        </div>
      </div>

      {/* Feed Room medication block — when checked, the TCP also surfaces
          on the Feed Room sheet with the AM/PM dosing for the feed crew. */}
      <div className="bg-[#f7f9fc] rounded-md px-3 py-2.5 border border-[#dae2ff]/50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="is_feedroom_medication"
            checked={isFeedroomMed}
            onChange={e => setIsFeedroomMed(e.target.checked)}
            className="accent-[#056380]"
          />
          <span className="text-xs font-semibold text-[#191c1e]">
            This is a Feed Room medication
          </span>
        </label>
        <p className="text-[10px] text-[#444650] mt-0.5 ml-5">
          Adds it to the Feed Room sheet with AM/PM dosing alongside the standing diet.
        </p>

        {isFeedroomMed && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
                AM dose
              </label>
              <textarea
                name="am_instruction"
                rows={2}
                placeholder="e.g. Bute 1g in feed"
                className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
              />
              <p className="mt-0.5 text-[10px] text-[#444650]">Leave blank if PM-only.</p>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
                PM dose
              </label>
              <textarea
                name="pm_instruction"
                rows={2}
                placeholder="e.g. Bute 1g in feed"
                className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
              />
              <p className="mt-0.5 text-[10px] text-[#444650]">Leave blank if AM-only.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save temporary care plan'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-[#444650] hover:text-[#191c1e]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
