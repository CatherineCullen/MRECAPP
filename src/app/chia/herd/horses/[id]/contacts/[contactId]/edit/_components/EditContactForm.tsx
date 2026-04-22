'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { updateHorseContact, removeHorseContact } from '../actions'

const ROLE_SUGGESTIONS = ['Owner', 'Co-Owner', 'Lessee', 'Parent/Guardian']

export default function EditContactForm({
  horseId,
  contactId,
  initial,
}: {
  horseId:   string
  contactId: string
  initial: {
    role:                   string | null
    is_billing_contact:     boolean
    can_log_in:             boolean
    receives_health_alerts: boolean
  }
}) {
  const [role, setRole] = useState(initial.role ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const [, action, pending] = useActionState(
    async (_prev: null, formData: FormData) => {
      await updateHorseContact(horseId, contactId, formData)
      return null
    },
    null,
  )

  const removeAction = removeHorseContact.bind(null, horseId, contactId)

  return (
    <form action={action} className="px-5 py-4 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-[#444650] mb-1">Role</label>
        <input
          name="role"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Owner, Lessee…"
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
          defaultChecked={initial.is_billing_contact}
          className="w-4 h-4 accent-[#002058]"
        />
        <span className="text-sm text-[#191c1e]">Primary billing contact</span>
      </label>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          name="can_log_in"
          type="checkbox"
          defaultChecked={initial.can_log_in}
          className="w-4 h-4 accent-[#002058]"
        />
        <span className="text-sm text-[#191c1e]">Has login access</span>
      </label>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          name="receives_health_alerts"
          type="checkbox"
          defaultChecked={initial.receives_health_alerts}
          className="w-4 h-4 accent-[#002058]"
        />
        <span className="text-sm text-[#191c1e]">Receives health alerts</span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Saving…' : 'Save Changes'}
        </button>
        <Link href={`/chia/herd/horses/${horseId}`} className="text-sm text-[#444650] hover:text-[#191c1e]">
          Cancel
        </Link>

        <div className="ml-auto">
          {confirmRemove ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="text-[#444650]">Remove this connection?</span>
              <button
                type="submit"
                formAction={removeAction}
                className="font-semibold text-red-700 hover:text-red-900 disabled:opacity-40"
              >
                Yes, remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="font-semibold text-[#444650] hover:text-[#191c1e]"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="text-xs font-semibold text-red-700 hover:text-red-900"
              title="Remove this person from the horse's contacts"
            >
              Remove connection
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
