'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// "Forgot password?" landing page. Submits email to Supabase's built-in
// recovery flow. Supabase sends the recovery email (template + SMTP live
// in the Supabase dashboard, NOT in our notification_template table).
//
// The recovery link in the email points at /reset-password — the route
// handler there consumes the one-shot code, establishes a session, and
// lets the user set a new password.
//
// We intentionally show the same success message whether or not the email
// matches an account, so this isn't a probe for "is X a user here?"

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: sbErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })

    setLoading(false)
    if (sbErr) {
      setError('Something went wrong. Please try again or contact the barn.')
      return
    }
    setSent(true)
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
          <h2 className="text-[#191c1e] font-bold text-lg mb-4">Reset password</h2>

          {sent ? (
            <>
              <p className="text-sm text-[#444650] mb-4">
                If an account exists for <strong>{email}</strong>, a password reset link has been sent.
                Check your inbox (and spam folder) for an email from Marlboro Ridge.
              </p>
              <a href="/sign-in" className="text-sm font-semibold text-[#056380]">← Back to sign-in</a>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-[#444650]">
                Enter the email on your account and we'll send you a link to set a new password.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#444650] uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full bg-[#e0e3e6] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#1a3673]"
                  placeholder="you@example.com"
                />
              </div>

              {error && <p className="text-[#ba1a1a] text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary text-white font-semibold text-sm rounded py-2.5 mt-2 disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <p className="text-xs text-[#444650] text-center">
                <a href="/sign-in" className="font-semibold text-[#056380]">← Back to sign-in</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
