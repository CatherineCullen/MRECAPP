import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SignOutButton from './_components/SignOutButton'

export default async function ChiaHome() {
  const user = await getCurrentUser()

  if (!user) redirect('/sign-in')
  if (!user.isAdmin) redirect('/sign-in') // non-admins get the mobile app (coming soon)

  const displayName = user.preferredName ?? user.firstName

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      {/* Top bar */}
      <header className="glass-nav sticky top-0 z-10 border-b border-[#c4c6d1]/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[#002058] font-bold text-xl tracking-tight">CHIA</span>
          <span className="text-[#444650] text-xs uppercase tracking-widest font-semibold">
            Marlboro Ridge
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#444650] text-sm">{displayName}</span>
          <SignOutButton />
        </div>
      </header>

      {/* Placeholder content */}
      <main className="p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-lg p-8 text-center">
          <h2 className="text-[#191c1e] font-bold text-2xl mb-2">Welcome to CHIA</h2>
          <p className="text-[#444650] text-sm">
            Signed in as {user.firstName} {user.lastName}
            {user.roles.length > 0 && (
              <> · {user.roles.join(', ')}</>
            )}
          </p>
          <p className="text-[#444650] text-sm mt-4">
            The dashboard is being built. Check back soon.
          </p>
        </div>
      </main>
    </div>
  )
}
