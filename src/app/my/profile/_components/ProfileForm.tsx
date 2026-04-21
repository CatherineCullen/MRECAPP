'use client'

import { useState, useTransition } from 'react'
import { updateMyProfile } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Person = {
  first_name: string
  last_name:  string
  email:      string | null
  phone:      string | null
  address:    string | null
  emergency_contact_name:  string | null
  emergency_contact_phone: string | null
}

export default function ProfileForm({ person }: { person: Person }) {
  const [phone,   setPhone]   = useState(person.phone   ?? '')
  const [address, setAddress] = useState(person.address ?? '')
  const [ecName,  setEcName]  = useState(person.emergency_contact_name  ?? '')
  const [ecPhone, setEcPhone] = useState(person.emergency_contact_phone ?? '')
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()
  const router                = useRouter()

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const res = await updateMyProfile({
        phone:                   phone   || undefined,
        address:                 address || undefined,
        emergency_contact_name:  ecName  || undefined,
        emergency_contact_phone: ecPhone || undefined,
      })
      if (res.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      {/* Identity — read-only */}
      <div className="bg-surface-lowest rounded-lg px-4 py-3">
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2">Account</h2>
        <p className="text-base font-bold text-on-surface">{person.first_name} {person.last_name}</p>
        {person.email && <p className="text-sm text-on-surface-muted mt-0.5">{person.email}</p>}
      </div>

      {/* Contact */}
      <div className="bg-surface-lowest rounded-lg px-4 py-3">
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-3">Contact</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">Phone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              placeholder="(555) 000-0000" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              placeholder="123 Main St, Town, State" />
          </div>
        </div>
      </div>

      {/* Emergency contact */}
      <div className="bg-surface-lowest rounded-lg px-4 py-3">
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-3">Emergency Contact</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">Name</label>
            <input type="text" value={ecName} onChange={e => setEcName(e.target.value)}
              className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              placeholder="Full name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">Phone</label>
            <input type="tel" value={ecPhone} onChange={e => setEcPhone(e.target.value)}
              className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              placeholder="(555) 000-0000" />
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-error px-1">{error}</p>}

      <button type="submit" disabled={pending}
        className="w-full btn-primary text-white font-semibold text-sm rounded py-3 disabled:opacity-50">
        {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
      </button>

      <button type="button" onClick={handleSignOut}
        className="w-full text-sm font-semibold text-on-surface-muted py-2">
        Sign out
      </button>
    </form>
  )
}
