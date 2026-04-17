import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import PersonForm from '../_components/PersonForm'
import { createPerson } from './actions'

export default async function NewPersonPage() {
  const supabase = createAdminClient()

  // Fetch existing people for guardian picker
  const { data: people } = await supabase
    .from('person')
    .select('id, first_name, last_name, is_minor')
    .is('deleted_at', null)
    .eq('is_minor', false)
    .order('last_name')

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/people" className="text-[#056380] hover:text-[#002058]">People</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Add Person</span>
      </div>
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 bg-[#f2f4f7]">
          <h2 className="text-sm font-bold text-[#191c1e]">Add Person</h2>
        </div>
        <PersonForm action={createPerson} cancelHref="/chia/people" people={people ?? []} />
      </div>
    </div>
  )
}
