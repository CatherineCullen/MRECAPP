'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PasswordSection() {
  const [open,    setOpen]    = useState(false)
  const [pw,      setPw]      = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (pw !== confirm) { setError('Passwords don\u2019t match.'); return }

    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setError(error.message); return }

    setPw(''); setConfirm('')
    setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 1800)
  }

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Password</h2>
        <span className="text-xs text-on-surface-muted">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <form onSubmit={handleSave} className="space-y-3 mt-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">New password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password"
              className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-1">Confirm</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
              className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container" />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <button type="submit" disabled={busy || !pw || !confirm}
            className="w-full btn-primary text-white font-semibold text-sm rounded py-2.5 disabled:opacity-50">
            {busy ? 'Updating\u2026' : saved ? 'Updated \u2713' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  )
}
