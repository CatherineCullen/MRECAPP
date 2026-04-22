'use client'

import { useState, useTransition } from 'react'
import { changeLoginEmail } from '../actions'

// Admin-only "Change login email" — intentional friction (separate button,
// confirm dialog) because this is a credential change, not a contact-field
// edit. Surfaced only when the person already has a login.

export default function ChangeLoginEmailButton({
  personId,
  currentEmail,
}: {
  personId: string
  currentEmail: string | null
}) {
  const [open, setOpen]       = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [pending, start]      = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const res = await changeLoginEmail(personId, newEmail)
      if (res.error) { setError(res.error); return }
      setOpen(false)
      setNewEmail('')
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
      >
        Change login email
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 bg-[#f2f4f7] rounded px-2 py-1.5">
      <span className="text-[11px] text-[#444650]">New email:</span>
      <input
        type="email"
        value={newEmail}
        onChange={e => setNewEmail(e.target.value)}
        placeholder={currentEmail ?? 'new@example.com'}
        className="bg-white border border-[#c4c6d1] rounded px-2 py-1 text-xs w-56 focus:outline-none focus:border-[#002058]"
        autoFocus
      />
      <button
        onClick={submit}
        disabled={pending || !newEmail.trim()}
        className="text-xs font-semibold text-white bg-[#002058] hover:bg-[#191c1e] rounded px-2 py-1 disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={() => { setOpen(false); setNewEmail(''); setError(null) }}
        disabled={pending}
        className="text-xs text-[#444650] hover:text-[#191c1e]"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-red-600 ml-1">{error}</span>}
    </div>
  )
}
