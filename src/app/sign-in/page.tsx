'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    router.push('/my/schedule')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#002058]">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <h1 className="text-[#dae2ff] font-bold text-2xl tracking-tight">
            Marlboro Ridge Equestrian Center
          </h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg p-8">
          <h2 className="text-[#191c1e] font-bold text-lg mb-6">Sign in</h2>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#444650] uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-[#e0e3e6] rounded px-3 py-2 text-sm text-[#191c1e] placeholder-[#444650] focus:outline-none focus:ring-2 focus:ring-[#1a3673]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#444650] uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-[#e0e3e6] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#1a3673]"
              />
            </div>

            {error && (
              <p className="text-[#ba1a1a] text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary text-white font-semibold text-sm rounded py-2.5 mt-2 disabled:opacity-60 transition-opacity"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-xs text-[#444650] text-center pt-1">
              <a href="/forgot-password" className="font-semibold text-[#056380]">Forgot password?</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
