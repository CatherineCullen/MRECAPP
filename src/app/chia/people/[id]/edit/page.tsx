import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PersonForm from '../../_components/PersonForm'
import { updatePerson } from './actions'

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: person, error }, { data: people }] = await Promise.all([
    supabase
      .from('person')
      .select(`
        *,
        person_role!person_role_person_id_fkey ( role, deleted_at )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('person')
      .select('id, first_name, last_name, is_minor')
      .is('deleted_at', null)
      .eq('is_minor', false)
      .neq('id', id)
      .order('last_name'),
  ])

  if (error) throw error
  if (!person) notFound()

  const displayName = person.is_organization
    ? person.organization_name
    : `${person.first_name} ${person.last_name}`

  const boundAction = updatePerson.bind(null, id)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/people" className="text-[#056380] hover:text-[#002058]">People</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/people/${id}`} className="text-[#056380] hover:text-[#002058]">{displayName}</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Edit</span>
      </div>
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 bg-[#f2f4f7]">
          <h2 className="text-sm font-bold text-[#191c1e]">Edit {displayName}</h2>
        </div>
        <PersonForm
          action={boundAction}
          cancelHref={`/chia/people/${id}`}
          person={person as any}
          people={people ?? []}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  )
}
