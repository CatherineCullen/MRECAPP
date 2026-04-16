'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs font-semibold text-[#056380] uppercase tracking-wider hover:text-[#002058] transition-colors"
    >
      Sign out
    </button>
  )
}
