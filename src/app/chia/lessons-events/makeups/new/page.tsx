import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import NewMakeupForm, { type RiderWithTokens, type TokenOption } from './_components/NewMakeupForm'

export default async function NewMakeupPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; time?: string }>
}) {
  const sp = await searchParams
  const prefillDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined
  const prefillTime = sp.time && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : undefined

  const supabase = createAdminClient()

  const [{ data: tokens, error: tokErr }, { data: people }, { data: horses }] = await Promise.all([
    // Only tokens that are tied to a subscription — admin-grant tokens without a
    // subscription can't flow through createLessonProduct's makeup branch.
    // Pull rider + originating lesson + quarter for context.
    supabase
      .from('makeup_token')
      .select(`
        id, rider_id, subscription_id, official_expires_at, created_at,
        rider:person!makeup_token_rider_id_fkey ( id, first_name, last_name, preferred_name ),
        original_lesson:lesson!makeup_token_original_lesson_id_fkey ( id, scheduled_at ),
        quarter:quarter ( id, label )
      `)
      .eq('status', 'available')
      .not('subscription_id', 'is', null)
      .order('official_expires_at', { ascending: true }),
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name, is_organization, organization_name,
        person_role!person_role_person_id_fkey ( role, deleted_at )
      `)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
    supabase
      .from('horse')
      .select('id, barn_name, lesson_horse')
      .is('deleted_at', null)
      .order('barn_name'),
  ])

  if (tokErr) throw tokErr

  // Group tokens by rider so the picker can show "who has makeups?" at a glance
  const byRider = new Map<string, RiderWithTokens>()
  for (const t of tokens ?? []) {
    const r = t.rider
    if (!r) continue
    const riderId = r.id
    if (!byRider.has(riderId)) {
      byRider.set(riderId, {
        riderId,
        riderName: displayName(r),
        tokens: [],
      })
    }
    byRider.get(riderId)!.tokens.push({
      id:         t.id,
      expiresAt:  t.official_expires_at,
      originDate: (t.original_lesson as any)?.scheduled_at ?? null,
      quarterLabel: (t.quarter as any)?.label ?? '—',
    } satisfies TokenOption)
  }
  const ridersWithTokens = Array.from(byRider.values())
    .sort((a, b) => a.riderName.localeCompare(b.riderName))

  const getRoles = (p: any): string[] =>
    (p.person_role ?? []).filter((r: any) => !r.deleted_at).map((r: any) => r.role)

  const instructors = (people ?? [])
    .filter(p => getRoles(p).includes('instructor'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  const horseOptions = (horses ?? []).map(h => ({
    id:          h.id,
    name:        h.barn_name,
    lessonHorse: !!h.lesson_horse,
  }))

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Calendar
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">Schedule Makeup</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Pick the date &amp; time, then the rider. Only riders with available makeup tokens appear in the list.
        </p>
      </div>

      {ridersWithTokens.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#c4c6d1]/40 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-[#191c1e] mb-1">No available makeup tokens</p>
          <p className="text-xs text-[#444650]">
            Nobody has an unused token right now. Tokens appear when a lesson is cancelled with a makeup.
          </p>
        </div>
      ) : (
        <NewMakeupForm
          riders={ridersWithTokens}
          instructors={instructors}
          horses={horseOptions}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
        />
      )}
    </div>
  )
}
