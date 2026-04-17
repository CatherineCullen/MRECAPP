'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveDiet } from '../../actions'

type Diet = {
  id:             string
  am_feed:        string | null
  am_supplements: string | null
  am_hay:         string | null
  pm_feed:        string | null
  pm_supplements: string | null
  pm_hay:         string | null
  notes:          string | null
  version:        number
} | null

function TextArea({ label, name, defaultValue, placeholder }: {
  label:         string
  name:          string
  defaultValue?: string
  placeholder?:  string
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-1">
        {label}
      </label>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        rows={2}
        className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
      />
    </div>
  )
}

function TimeSection({ label, prefix, diet }: {
  label:  string
  prefix: 'am' | 'pm'
  diet:   Diet
}) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider border-b border-[#f2f4f7] pb-1">
        {label}
      </div>
      <TextArea
        label="Feed"
        name={`${prefix}_feed`}
        defaultValue={(diet as any)?.[`${prefix}_feed`] ?? ''}
        placeholder="e.g. 1 scoop Tribute Essential K"
      />
      <TextArea
        label="Supplements / Meds"
        name={`${prefix}_supplements`}
        defaultValue={(diet as any)?.[`${prefix}_supplements`] ?? ''}
        placeholder="e.g. SmartFlex Senior — 1 scoop"
      />
      <TextArea
        label="Hay"
        name={`${prefix}_hay`}
        defaultValue={(diet as any)?.[`${prefix}_hay`] ?? ''}
        placeholder="e.g. 2 flakes timothy"
      />
    </div>
  )
}

export default function DietForm({
  horseId,
  existingId,
  diet,
}: {
  horseId:    string
  existingId: string | null
  diet:       Diet
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await saveDiet(horseId, existingId, fd)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <TimeSection label="AM" prefix="am" diet={diet} />
      <TimeSection label="PM" prefix="pm" diet={diet} />

      <div>
        <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider border-b border-[#f2f4f7] pb-1 mb-3">
          Notes
        </div>
        <TextArea
          label="Notes"
          name="notes"
          defaultValue={diet?.notes ?? ''}
          placeholder="Any special feeding instructions or alerts."
        />
      </div>

      {diet && (
        <p className="text-[10px] text-[#444650]">
          Saving will archive the current record (v{diet.version}) and create v{diet.version + 1}.
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save diet'}
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
