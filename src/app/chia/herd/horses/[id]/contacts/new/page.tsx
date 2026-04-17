import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import AddContactForm from './_components/AddContactForm'

export default async function AddHorseContactPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: horse, error: horseError } = await supabase
    .from('horse')
    .select('id, barn_name')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (horseError) throw horseError
  if (!horse) notFound()

  // Load all active people to pick from
  const { data: people, error: peopleError } = await supabase
    .from('person')
    .select('id, first_name, last_name, organization_name, is_organization')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')

  if (peopleError) throw peopleError

  // Exclude people already linked to this horse
  const { data: existing } = await supabase
    .from('horse_contact')
    .select('person_id')
    .eq('horse_id', id)
    .is('deleted_at', null)

  const existingIds = new Set((existing ?? []).map((c) => c.person_id))
  const available   = (people ?? []).filter((p) => !existingIds.has(p.id))

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">Horses</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/herd/horses/${id}`} className="text-[#056380] hover:text-[#002058]">{horse.barn_name}</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Add Contact</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7]">
          <h1 className="text-sm font-bold text-[#191c1e]">Add Contact — {horse.barn_name}</h1>
        </div>
        <AddContactForm horseId={id} people={available} />
      </div>
    </div>
  )
}
