import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ChiaSidebar from './_components/ChiaSidebar'
import ChiaTopBar from './_components/ChiaTopBar'

// Admin-side branding: tabs read "CHIA" so admins can distinguish them from
// rider-facing tabs ("Marlboro Ridge Equestrian Center") when both are open.
export const metadata: Metadata = {
  title: {
    default:  'CHIA',
    template: '%s — CHIA',
  },
}

export default async function ChiaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  if (!user.isAdmin) redirect('/my/schedule')

  return (
    <div className="flex h-screen bg-[#f7f9fc] overflow-hidden" style={{ zoom: 1.08 }}>
      <ChiaSidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ChiaTopBar user={user} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
