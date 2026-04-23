'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Landing page for Supabase password-reset recovery links. Supabase sends
// the email with a link to this page carrying a one-shot `?code=...` PKCE
// code in the URL. @supabase/ssr's browser client auto-exchanges that code
// for a (short-lived, recovery-scoped) session on mount. Once we have
// that session, updateUser({ password }) sets the new password, and we
// drop them onto /my/schedule.
//
// If the code is missing, expired, or already consumed (e.g. link clicked
// twice), getUser() returns null and we show a sensible error.

export default function ResetPasswordPage() {
  const router = useRouter()

  const [checking,   setChecking]   = useState(true)
  const [sessionOk,  setSessionOk]  = useState(false)
  const [password,   setPassword]   = useState('')
  const [password2,  setPassword2]  = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // Give the SDK a moment to consume the ?code=... from the URL and
    // establish the recovery session, then check whether we have one.
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      setSessionOk(!!data.user)
      setChecking(false)
    })()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== password2)     { setError('Passwords do not match.');                  return }
    if (password.length < 8)        { setError('Password must be at least 8 characters.');  return }

    setLoading(true)
    const supabase = createClient()
    const { error: sbErr } = await supabase.auth.updateUser({ password })
    if (sbErr) {
      setError(sbErr.message || 'Failed to update password.')
      setLoading(false)
      return
    }
    setSaved(true)
    router.push('/my/schedule')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#002058]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-[#dae2ff] font-bold text-2xl tracking-tight">
            Marlboro Ridge Equestrian Center
          </h1>
        </div>

        <div className="bg-white rounded-lg p-8">
          <h2 className="text-[#191c1e] font-bold text-lg mb-4">Set a new password</h2>

          {checking ? (
            <p className="text-sm text-[#444650]">Verifying your link…</p>
          ) : !sessionOk ? (
            <div className="space-y-3 text-sm text-[#444650]">
              <p>This reset link is invalid or has expired.</p>
              <p>
                <a href="/forgot-password" className="font-semibold text-[#056380]">
                  Request a new one →
                </a>
              </p>
            </div>
          ) : saved ? (
            <p className="text-sm text-[#444650]">Password updated. Signing you in…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#444650] uppercase tracking-wider mb-1">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full bg-[#e0e3e6] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#1a3673]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#444650] uppercase tracking-wider mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full bg-[#e0e3e6] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#1a3673]"
                />
              </div>

              {error && <p className="text-[#ba1a1a] text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary text-white font-semibold text-sm rounded py-2.5 mt-2 disabled:opacity-60"
              >
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
