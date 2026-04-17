import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import EditHorseForm from './_components/EditHorseForm'

export default async function EditHorsePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: horse, error } = await supabase
    .from('horse')
    .select('*, horse_recording_ids (*)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!horse) notFound()

  const recordingIds = (horse.horse_recording_ids as any) ?? null

  return (
    <div className="p-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">
          Horses
        </Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/herd/horses/${id}`} className="text-[#056380] hover:text-[#002058]">
          {horse.barn_name}
        </Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Edit</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 bg-[#f2f4f7]">
          <h2 className="text-sm font-bold text-[#191c1e]">Edit {horse.barn_name}</h2>
        </div>
        <EditHorseForm horse={horse} recordingIds={recordingIds} />
      </div>
    </div>
  )
}
