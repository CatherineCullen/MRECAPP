'use client'

import { useActionState, useState } from 'react'
import { updateMyHorse } from '../actions'

const GENDER_OPTIONS = ['Mare', 'Gelding', 'Stallion', 'Colt', 'Filly']

type Props = {
  horse: any
  recordingIds: any
  role: string | null
}

export default function HorseHeaderCard({ horse, recordingIds, role }: Props) {
  const [editing, setEditing] = useState(false)
  const [, action, pending] = useActionState(
    async (_prev: null, formData: FormData) => {
      await updateMyHorse(horse.id, formData)
      setEditing(false)
      return null
    },
    null
  )

  const dobValue = horse.date_of_birth ? horse.date_of_birth.substring(0, 10) : ''

  if (!editing) {
    return (
      <div className="bg-surface-lowest rounded-lg px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-on-surface">{horse.barn_name}</h1>
          <div className="flex items-center gap-2">
            {role && (
              <span className="text-[10px] font-semibold bg-primary-fixed text-primary px-1.5 py-0.5 rounded uppercase tracking-wide">
                {role}
              </span>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-on-secondary-container"
            >
              Expand
            </button>
          </div>
        </div>
      </div>
    )
  }

  const inputCls = 'w-full border border-outline rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary bg-surface-lowest'
  const labelCls = 'block text-xs font-semibold text-on-surface-muted mb-1'
  const legendCls = 'text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider pb-1'

  return (
    <form action={action} className="bg-surface-lowest rounded-lg px-4 py-3 space-y-5">
      <fieldset className="space-y-3">
        <legend className={legendCls}>Identity</legend>

        <div>
          <label className={labelCls}>
            Barn Name <span className="text-error">*</span>
          </label>
          <input name="barn_name" required defaultValue={horse.barn_name ?? ''} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Registered Name</label>
          <input name="registered_name" defaultValue={horse.registered_name ?? ''} className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Gender</label>
            <select name="gender" defaultValue={horse.gender ?? ''} className={inputCls}>
              <option value="">—</option>
              {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date of Birth</label>
            <input name="date_of_birth" type="date" defaultValue={dobValue} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Breed</label>
            <input name="breed" defaultValue={horse.breed ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <input name="color" defaultValue={horse.color ?? ''} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Height (hh)</label>
            <input name="height" type="number" step="0.1" min="10" max="20" defaultValue={horse.height ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Weight (lbs)</label>
            <input name="weight" type="number" min="200" max="3000" defaultValue={horse.weight ?? ''} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Microchip</label>
          <input name="microchip" defaultValue={horse.microchip ?? ''} className={inputCls} />
        </div>

      </fieldset>

      <fieldset className="space-y-3">
        <legend className={legendCls}>Notes</legend>

        <div>
          <label className={labelCls}>General Notes</label>
          <textarea name="notes" rows={3} defaultValue={horse.notes ?? ''} className={`${inputCls} resize-y`} />
        </div>
        <div>
          <label className={labelCls}>Turnout Notes</label>
          <textarea name="turnout_notes" rows={2} defaultValue={horse.turnout_notes ?? ''} className={`${inputCls} resize-y`} />
        </div>
        <div>
          <label className={labelCls}>Ownership Notes</label>
          <textarea name="ownership_notes" rows={2} defaultValue={horse.ownership_notes ?? ''} className={`${inputCls} resize-y`} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={legendCls}>Recording / Registration IDs</legend>

        <div>
          <label className={labelCls}>USEF ID</label>
          <input name="usef_id" defaultValue={recordingIds?.usef_id ?? ''} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Breed Recording</label>
          <input name="breed_recording_number" defaultValue={recordingIds?.breed_recording_number ?? ''} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Passport</label>
          <input name="passport_number" defaultValue={recordingIds?.passport_number ?? ''} className={inputCls} />
        </div>
      </fieldset>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-on-primary text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-on-surface-muted"
        >
          Close
        </button>
      </div>
    </form>
  )
}
