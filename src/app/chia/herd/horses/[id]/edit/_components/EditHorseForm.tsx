'use client'

import { useActionState } from 'react'
import { updateHorse } from '../actions'

const GENDER_OPTIONS = ['Mare', 'Gelding', 'Stallion', 'Colt', 'Filly']
const STATUS_OPTIONS = [
  { value: 'pending',  label: 'Pending'  },
  { value: 'active',   label: 'Active'   },
  { value: 'away',     label: 'Away'     },
  { value: 'archived', label: 'Archived' },
]

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60 transition-opacity"
    >
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  )
}

export default function EditHorseForm({ horse, recordingIds }: { horse: any; recordingIds: any }) {
  const [, action, pending] = useActionState(
    async (_prev: null, formData: FormData) => {
      await updateHorse(horse.id, formData)
      return null
    },
    null
  )

  // Format date_of_birth for input[type=date] (YYYY-MM-DD)
  const dobValue = horse.date_of_birth ? horse.date_of_birth.substring(0, 10) : ''

  return (
    <form action={action} className="px-5 py-4 space-y-5">

      {/* ── Identity ── */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Identity</legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">
              Barn Name <span className="text-[#b00020]">*</span>
            </label>
            <input
              name="barn_name"
              required
              defaultValue={horse.barn_name ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Registered Name</label>
            <input
              name="registered_name"
              defaultValue={horse.registered_name ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Status</label>
            <select
              name="status"
              defaultValue={horse.status}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
            >
              {STATUS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Gender</label>
            <select
              name="gender"
              defaultValue={horse.gender ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
            >
              <option value="">—</option>
              {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Breed</label>
            <input
              name="breed"
              defaultValue={horse.breed ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Color</label>
            <input
              name="color"
              defaultValue={horse.color ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Date of Birth</label>
            <input
              name="date_of_birth"
              type="date"
              defaultValue={dobValue}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Height (hh)</label>
            <input
              name="height"
              type="number"
              step="0.1"
              min="10"
              max="20"
              defaultValue={horse.height ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Weight (lbs)</label>
            <input
              name="weight"
              type="number"
              min="200"
              max="3000"
              defaultValue={horse.weight ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Microchip</label>
            <input
              name="microchip"
              defaultValue={horse.microchip ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
        </div>

        {/* Flags */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              name="lesson_horse"
              type="checkbox"
              defaultChecked={horse.lesson_horse}
              className="w-4 h-4 accent-[#002058]"
            />
            <span className="text-sm text-[#191c1e]">Lesson horse</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              name="solo_turnout"
              type="checkbox"
              defaultChecked={horse.solo_turnout}
              className="w-4 h-4 accent-[#002058]"
            />
            <span className="text-sm text-[#191c1e]">Solo turnout</span>
          </label>
        </div>
      </fieldset>

      {/* ── Notes ── */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Notes</legend>

        <div>
          <label className="block text-xs font-semibold text-[#444650] mb-1">General Notes</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={horse.notes ?? ''}
            className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#444650] mb-1">Turnout Notes</label>
          <textarea
            name="turnout_notes"
            rows={2}
            defaultValue={horse.turnout_notes ?? ''}
            className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#444650] mb-1">Ownership Notes</label>
          <textarea
            name="ownership_notes"
            rows={2}
            defaultValue={horse.ownership_notes ?? ''}
            className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
          />
        </div>
      </fieldset>

      {/* ── Recording / Registration IDs ── */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Recording / Registration IDs</legend>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">USEF ID</label>
            <input
              name="usef_id"
              defaultValue={recordingIds?.usef_id ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Breed Recording</label>
            <input
              name="breed_recording_number"
              defaultValue={recordingIds?.breed_recording_number ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Passport</label>
            <input
              name="passport_number"
              defaultValue={recordingIds?.passport_number ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
        </div>
      </fieldset>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pending={pending} />
        <a href={`/chia/herd/horses/${horse.id}`} className="text-sm text-[#444650] hover:text-[#191c1e]">
          Cancel
        </a>
      </div>
    </form>
  )
}
