import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DietForm from './_components/DietForm'

export default async function DietEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: horseId } = await params
  const supabase = createAdminClient()

  const { data: horse } = await supabase
    .from('horse')
    .select('id, barn_name')
    .eq('id', horseId)
    .is('deleted_at', null)
    .single()

  if (!horse) notFound()

  const { data: dietRows } = await supabase
    .from('diet_record')
    .select('id, am_feed, am_supplements, am_hay, pm_feed, pm_supplements, pm_hay, notes, version')
    .eq('horse_id', horseId)
    .is('deleted_at', null)
    .order('version', { ascending: false })
    .limit(1)

  const diet = dietRows?.[0] ?? null

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">Horses</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/herd/horses/${horseId}`} className="text-[#056380] hover:text-[#002058]">{horse.barn_name}</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">{diet ? 'Edit Diet' : 'Add Diet'}</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7]">
          <h1 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
            {diet ? `Diet — ${horse.barn_name}` : `New Diet — ${horse.barn_name}`}
            {diet && diet.version > 1 && <span className="ml-1.5 font-normal text-[#444650]">v{diet.version}</span>}
          </h1>
        </div>
        <div className="p-4">
          <DietForm horseId={horseId} existingId={diet?.id ?? null} diet={diet} />
        </div>
      </div>
    </div>
  )
}
