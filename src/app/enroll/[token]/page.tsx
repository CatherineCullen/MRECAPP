import { createAdminClient } from '@/lib/supabase/admin'
import { loadCurrentTemplate } from '@/app/chia/documents/_lib/loadTemplate'
import EnrollmentForm from './_components/EnrollmentForm'

// Public page — no auth required. The token IS the authorization. We hydrate
// it with the stub Person(s) the admin already created so the rider is just
// filling in / confirming; they never have to know about the stub.

export default async function EnrollPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = createAdminClient()

  const { data: tok } = await db
    .from('enrollment_token')
    .select(`
      *,
      rider:person!enrollment_token_rider_person_id_fkey    ( id, first_name, last_name, date_of_birth ),
      guardian:person!enrollment_token_guardian_person_id_fkey ( id, first_name, last_name, email, phone )
    `)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  const isExpired = tok && new Date(tok.expires_at).getTime() < Date.now()
  const isUsed = tok?.used_at != null

  if (!tok) {
    return <ErrorShell title="Link not found" message="This enrollment link is not valid. Please contact the barn." />
  }
  if (isUsed) {
    return <ErrorShell title="Already completed" message="This enrollment has already been completed. Your account is active — contact the barn if you need help signing in." />
  }
  if (isExpired) {
    return <ErrorShell title="Link expired" message="This enrollment link has expired. Please contact the barn for a new link." />
  }

  const template = await loadCurrentTemplate(tok.template_kind as 'waiver' | 'boarding_agreement')
  if (!template) {
    return <ErrorShell title="Not ready" message="The barn hasn't finished setting up this document yet. Please check back later or contact the office." />
  }

  const rider = tok.rider as { first_name: string | null; last_name: string | null; date_of_birth: string | null } | null
  const guardian = tok.guardian as { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null

  return (
    <div className="min-h-screen bg-[#f7f9fc] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[#002058]">Marlboro Ridge Equestrian Center</h1>
          <p className="text-sm text-[#444650] mt-1">
            {tok.template_kind === 'waiver' ? 'Rider Waiver & Enrollment' : 'Boarding Agreement & Enrollment'}
          </p>
        </div>

        <EnrollmentForm
          token={token}
          kind={tok.kind as 'adult' | 'minor'}
          templateKind={tok.template_kind as 'waiver' | 'boarding_agreement'}
          templateBody={template.body_markdown}
          templateVersion={template.version}
          prefill={{
            riderFirstName: rider?.first_name ?? '',
            riderLastName:  rider?.last_name  ?? '',
            riderDob:       rider?.date_of_birth ?? '',
            parentFirstName: guardian?.first_name ?? '',
            parentLastName:  guardian?.last_name  ?? '',
            parentEmail:     guardian?.email ?? '',
            parentPhone:     guardian?.phone ?? '',
          }}
        />
      </div>
    </div>
  )
}

function ErrorShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-[#f7f9fc] py-16 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-lg p-6 text-center">
        <h1 className="text-lg font-bold text-[#191c1e] mb-2">{title}</h1>
        <p className="text-sm text-[#444650]">{message}</p>
      </div>
    </div>
  )
}
