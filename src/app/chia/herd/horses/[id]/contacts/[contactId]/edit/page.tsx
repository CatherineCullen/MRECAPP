import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import EditContactForm from './_components/EditContactForm'

export default async function EditHorseContactPage({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>
}) {
  const { id, contactId } = await params
  const supabase = createAdminClient()

  const [{ data: horse }, { data: contact }] = await Promise.all([
    supabase
      .from('horse')
      .select('id, barn_name')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('horse_contact')
      .select(`
        id, role, is_billing_contact, can_log_in, receives_health_alerts,
        person:person ( first_name, last_name, preferred_name, organization_name, is_organization )
      `)
      .eq('id', contactId)
      .eq('horse_id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  ])

  if (!horse || !contact) notFound()

  const p = contact.person as {
    first_name: string | null; last_name: string | null
    preferred_name: string | null; organization_name: string | null
    is_organization: boolean
  } | null
  const personName = p?.is_organization
    ? (p.organization_name ?? 'Unknown')
    : [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unknown'

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">Horses</Link>
        <span className="text-[#c4c6d1]">/</span>
        <Link href={`/chia/herd/horses/${id}`} className="text-[#056380] hover:text-[#002058]">{horse.barn_name}</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Edit Contact</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#f2f4f7]">
          <h1 className="text-sm font-bold text-[#191c1e]">Edit Contact — {personName}</h1>
          <p className="text-xs text-[#444650] mt-0.5">{horse.barn_name}</p>
        </div>
        <EditContactForm
          horseId={id}
          contactId={contactId}
          initial={{
            role:                   contact.role ?? null,
            is_billing_contact:     !!contact.is_billing_contact,
            can_log_in:             !!contact.can_log_in,
            receives_health_alerts: !!contact.receives_health_alerts,
          }}
        />
      </div>
    </div>
  )
}
