import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UploadsQueue, { type UploadRow } from './_components/UploadsQueue'

export const metadata = { title: 'Uploads — CHIA' }

type RawDocRow = {
  id: string
  horse_id: string | null
  filename: string
  uploaded_at: string
  reviewed_at: string | null
  horse: { id: string; barn_name: string } | null
  uploader: { first_name: string | null; last_name: string | null; preferred_name: string | null } | null
  reviewer: { first_name: string | null; last_name: string | null; preferred_name: string | null } | null
}

function displayName(
  p: { first_name: string | null; last_name: string | null; preferred_name: string | null } | null,
) {
  if (!p) return 'Unknown'
  const first = p.preferred_name ?? p.first_name ?? ''
  return `${first} ${p.last_name ?? ''}`.trim() || 'Unknown'
}

export default async function UploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/sign-in')

  const { show } = await searchParams
  const showProcessed = show === 'processed'

  const db = createAdminClient()

  let query = db
    .from('document')
    .select(`
      id, horse_id, filename, uploaded_at, reviewed_at,
      horse:horse_id ( id, barn_name ),
      uploader:uploaded_by ( first_name, last_name, preferred_name ),
      reviewer:reviewed_by ( first_name, last_name, preferred_name )
    `)
    .eq('submitted_by_owner', true)
    .is('deleted_at', null)

  query = showProcessed
    ? query.not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(50)
    : query.is('reviewed_at', null).order('uploaded_at', { ascending: true })

  const { data: docs } = await query

  const rows: UploadRow[] = ((docs ?? []) as unknown as RawDocRow[]).map(d => ({
    id:          d.id,
    horseId:     d.horse?.id ?? d.horse_id,
    horseName:   d.horse?.barn_name ?? '(no horse)',
    filename:    d.filename,
    uploadedAt:  d.uploaded_at,
    uploadedBy:  displayName(d.uploader),
    reviewedAt:  d.reviewed_at,
    reviewedBy:  d.reviewer ? displayName(d.reviewer) : null,
  }))

  return <UploadsQueue rows={rows} showProcessed={showProcessed} />
}
