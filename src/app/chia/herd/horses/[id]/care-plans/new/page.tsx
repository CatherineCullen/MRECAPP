import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import AddCarePlanForm from './_components/AddCarePlanForm'

export default async function NewCarePlanPage({
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

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">Horses</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/herd/horses/${horseId}`} className="text-[#056380] hover:text-[#002058]">{horse.barn_name}</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Add Temporary Care Plan</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7]">
          <h1 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">New Temporary Care Plan — {horse.barn_name}</h1>
        </div>
        <div className="p-4">
          <AddCarePlanForm horseId={horseId} />
        </div>
      </div>
    </div>
  )
}
