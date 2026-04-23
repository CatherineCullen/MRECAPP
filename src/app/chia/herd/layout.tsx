import { createAdminClient } from '@/lib/supabase/admin'
import HerdTabs from './_components/HerdTabs'

export default async function HerdLayout({ children }: { children: React.ReactNode }) {
  const db = createAdminClient()
  const { count: pendingUploads } = await db
    .from('document')
    .select('id', { count: 'exact', head: true })
    .eq('submitted_by_owner', true)
    .is('reviewed_at', null)
    .is('deleted_at', null)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-0 border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
        <h1 className="text-[#191c1e] font-bold text-lg tracking-tight mb-3">Herd</h1>
        <HerdTabs pendingUploads={pendingUploads ?? 0} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
