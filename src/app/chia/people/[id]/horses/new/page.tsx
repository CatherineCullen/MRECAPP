import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LinkHorseForm from './_components/LinkHorseForm'

export default async function LinkHorsePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: person, error: personError } = await supabase
    .from('person')
    .select('id, first_name, last_name, organization_name, is_organization')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (personError) throw personError
  if (!person) notFound()

  const displayName = person.is_organization
    ? person.organization_name
    : [person.first_name, person.last_name].filter(Boolean).join(' ')

  // Load all active horses to pick from
  const { data: horses, error: horsesError } = await supabase
    .from('horse')
    .select('id, barn_name, status')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('barn_name')

  if (horsesError) throw horsesError

  // Exclude horses already linked to this person
  const { data: existing } = await supabase
    .from('horse_contact')
    .select('horse_id')
    .eq('person_id', id)
    .is('deleted_at', null)

  const existingIds = new Set((existing ?? []).map((c) => c.horse_id))
  const available   = (horses ?? []).filter((h) => !existingIds.has(h.id))

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/people" className="text-[#056380] hover:text-[#002058]">People</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/people/${id}`} className="text-[#056380] hover:text-[#002058]">{displayName}</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Link Horse</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7]">
          <h1 className="text-sm font-bold text-[#191c1e]">Link Horse — {displayName}</h1>
        </div>
        <LinkHorseForm personId={id} horses={available} />
      </div>
    </div>
  )
}
