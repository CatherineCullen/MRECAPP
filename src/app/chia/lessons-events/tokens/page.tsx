import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import TokenTable, { type TokenRow } from './_components/TokenTable'
import { displayName } from '@/lib/displayName'

export default async function TokensPage() {
  const supabase = createAdminClient()

  // Pull all tokens. We filter client-side so the admin can toggle filters
  // without a server round-trip. Volume is manageable (tens-to-hundreds per quarter).
  const { data: tokens, error } = await supabase
    .from('makeup_token')
    .select(`
      id, status, reason, grant_reason, notes, created_at, official_expires_at,
      quarter:quarter ( id, label, end_date ),
      rider:person!makeup_token_rider_id_fkey ( id, first_name, last_name, preferred_name ),
      origin:lesson!makeup_token_original_lesson_id_fkey ( id, scheduled_at )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows: TokenRow[] = (tokens ?? []).map(t => ({
    id:                   t.id,
    rider_id:             t.rider?.id ?? null,
    rider_name:           displayName(t.rider) || '—',
    quarter_id:           t.quarter?.id ?? '',
    quarter_label:        t.quarter?.label ?? '—',
    original_lesson_date: t.origin?.scheduled_at?.slice(0, 10) ?? null,
    reason:               t.reason as TokenRow['reason'],
    grant_reason:         t.grant_reason,
    official_expires_at:  t.official_expires_at,
    status:               t.status as TokenRow['status'],
    notes:                t.notes,
    created_at:           t.created_at,
  }))

  // Distinct quarters for the filter dropdown
  const quarterMap = new Map<string, string>()
  for (const r of rows) if (r.quarter_id) quarterMap.set(r.quarter_id, r.quarter_label)
  const quarterOpts = Array.from(quarterMap.entries()).map(([id, label]) => ({ id, label }))

  // Counts for header
  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
            ← Calendar
          </Link>
          <h2 className="text-sm font-bold text-[#191c1e] mt-1">Makeup Tokens</h2>
          <p className="text-xs text-[#444650] mt-0.5">
            All tokens across riders. {counts.available ?? 0} available · {counts.scheduled ?? 0} scheduled · {counts.used ?? 0} used · {counts.expired ?? 0} expired
          </p>
        </div>
        <Link
          href="/chia/lessons-events/tokens/new"
          className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] transition-colors"
        >
          + Grant Token
        </Link>
      </div>

      <TokenTable rows={rows} quarters={quarterOpts} />
    </div>
  )
}
