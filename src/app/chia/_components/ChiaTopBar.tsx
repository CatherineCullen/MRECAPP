'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { CurrentUser } from '@/lib/auth'

export default function ChiaTopBar({ user }: { user: CurrentUser }) {
  const router = useRouter()
  const displayName = user.preferredName ?? user.firstName

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <header className="glass-nav sticky top-0 z-10 border-b border-[#c4c6d1]/20 px-5 py-2.5 flex items-center justify-end gap-4">
      <span className="text-[#444650] text-xs">{displayName} {user.lastName}</span>
      <button
        onClick={handleSignOut}
        className="text-xs font-semibold text-[#056380] uppercase tracking-wider hover:text-[#002058] transition-colors"
      >
        Sign out
      </button>
    </header>
  )
}
