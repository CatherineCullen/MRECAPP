'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import SearchPicker from '@/components/SearchPicker'
import { linkPersonToHorse } from '../actions'

const ROLE_SUGGESTIONS = ['Owner', 'Co-Owner', 'Lessee', 'Parent/Guardian']

export default function LinkHorseForm({
  personId,
  horses,
}: {
  personId: string
  horses:   { id: string; barn_name: string; status: string }[]
}) {
  const [role, setRole] = useState('')

  const [, action, pending] = useActionState(
    async (_prev: null, formData: FormData) => {
      await linkPersonToHorse(personId, formData)
      return null
    },
    null
  )

  return (
    <form action={action} className="px-5 py-4 space-y-4">

      <div>
        <label className="block text-xs font-semibold text-[#444650] mb-1">
          Horse <span className="text-[#b00020]">*</span>
        </label>
        {horses.length === 0 ? (
          <p className="text-sm text-[#444650]">No active horses available to link.</p>
        ) : (
          <SearchPicker
            name="horse_id"
            required
            placeholder="Search by name…"
            options={horses.map((h) => ({ id: h.id, label: h.barn_name }))}
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#444650] mb-1">Role</label>
        <input
          name="role"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Owner, Lessee, Proud Christmas Boy…"
          className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
        />
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {ROLE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRole(s)}
              className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                role === s
                  ? 'bg-[#002058] text-white border-[#002058]'
                  : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#056380] hover:text-[#056380]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          name="is_billing_contact"
          type="checkbox"
          className="w-4 h-4 accent-[#002058]"
        />
        <span className="text-sm text-[#191c1e]">Primary billing contact</span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending || horses.length === 0}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Saving…' : 'Link Horse'}
        </button>
        <Link href={`/chia/people/${personId}`} className="text-sm text-[#444650] hover:text-[#191c1e]">
          Cancel
        </Link>
      </div>
    </form>
  )
}
