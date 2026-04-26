import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import NewSheetForm, { type ProviderServicePair } from './_components/NewSheetForm'

export default async function NewSheetPage() {
  const supabase = createAdminClient()

  // Sheets require an existing active provider QR. Pull the (provider, service)
  // pairs that already have one so the picker can't produce an invalid combo.
  const { data: qrs, error } = await supabase
    .from('provider_qr_code')
    .select(`
      provider_person_id,
      service_id,
      person:person!provider_qr_code_provider_person_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name, deleted_at ),
      service:board_service!provider_qr_code_service_id_fkey ( id, name, deleted_at )
    `)
    .eq('is_active', true)

  if (error) throw error

  const pairs: ProviderServicePair[] = (qrs ?? [])
    .filter((q: any) => q.person && !q.person.deleted_at && q.service && !q.service.deleted_at)
    .map((q: any) => ({
      providerPersonId: q.provider_person_id,
      providerName:     displayName(q.person),
      serviceId:        q.service_id,
      serviceName:      q.service.name,
    }))
    .sort((a, b) =>
      a.providerName.localeCompare(b.providerName) ||
      a.serviceName.localeCompare(b.serviceName)
    )

  return (
    <div className="p-6 max-w-2xl">
      <Link
        href="/chia/boarding/sheets"
        className="text-xs text-[#056380] hover:underline"
      >
        ← Back to sheets
      </Link>
      <h1 className="text-xl font-semibold text-[#191c1e] mt-2 mb-4">New sign-up sheet</h1>

      {pairs.length === 0 ? (
        <div className="bg-white rounded-lg p-6 text-sm text-[#444650]">
          No active provider QR codes exist yet. Create one in{' '}
          <Link href="/chia/boarding/qr-codes" className="text-[#056380] hover:underline">QR Codes</Link>{' '}
          first — sheets are anchored to a specific provider + service.
        </div>
      ) : (
        <NewSheetForm pairs={pairs} />
      )}
    </div>
  )
}
