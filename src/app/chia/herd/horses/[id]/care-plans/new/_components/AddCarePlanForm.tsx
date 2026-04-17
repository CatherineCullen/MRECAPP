'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addCarePlan } from '../../actions'

export default function AddCarePlanForm({ horseId }: { horseId: string }) {
  const [isPending, startTransition] = useTransition()
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
