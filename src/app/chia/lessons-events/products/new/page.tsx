import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import NewLessonProductForm from './_components/NewLessonProductForm'
import { displayName } from '@/lib/displayName'

export default async function NewLessonProductPage({
  searchParams,
}: {
  searchParams: Promise<{ tokenId?: string; date?: string; time?: string }>
}) {
  const params   = await searchParams
  const tokenId  = params.tokenId
  const supabase = createAdminClient()

  // Click-from-calendar prefill
  const clickedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined
  const clickedTime = params.time && /^\d{2}:\d{2}$/.test(params.time) ? params.time : undefined

  // Parallel fetch: people, horses, and (if makeup) the token with its context
  const [{ data: people }, { data: horses }, tokenResult] = await Promise.all([
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name, is_organization, organization_name,
        is_minor, guardian_id,
        person_role!person_role_person_id_fkey ( role, deleted_at )
      `)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
    supabase
      .from('horse')
      .select('id, barn_name')
      .is('deleted_at', null)
      .order('barn_name'),
    tokenId
      ? supabase
          .from('makeup_token')
          .select(`
            id, status, reason, official_expires_at, rider_id,
            rider:person!makeup_token_rider_id_fkey ( first_name, last_name, preferred_name ),
            quarter:quarter ( label, start_date, end_date ),
            origin:lesson!makeup_token_original_lesson_id_fkey ( scheduled_at )
          `)
          .eq('id', tokenId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const getRoles = (p: any): string[] =>
    (p.person_role ?? []).filter((r: any) => !r.deleted_at).map((r: any) => r.role)

  const riders = (people ?? [])
    .filter(p => !p.is_organization)
    .map(p => ({
      id:               p.id,
      name:             displayName(p),
      defaultBilledToId: (p.is_minor && p.guardian_id) ? p.guardian_id : p.id,
    }))

  const billers = (people ?? [])
    .map(p => ({ id: p.id, name: displayName(p) }))

  const instructors = (people ?? [])
    .filter(p => getRoles(p).includes('instructor'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  // Makeup context — only when tokenId is present and valid
  let makeup: React.ComponentProps<typeof NewLessonProductForm>['makeup'] = undefined
  let suggestedDate: string | undefined
  let makeupDays: string[] | undefined

  if (tokenId) {
    if (tokenResult.error || !tokenResult.data) notFound()
    const t = tokenResult.data
    if (t.status !== 'available') {
      // Can't redeem a non-available token
      return (
        <div className="p-6 max-w-2xl">
          <Link href="/chia/lessons-events/tokens" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
            ← Tokens
          </Link>
          <div className="mt-4 bg-[#ffd6d6]/40 border border-[#8a1a1a]/30 rounded-lg px-4 py-3">
            <div className="text-sm font-bold text-[#8a1a1a] mb-1">Token is {t.status}</div>
            <p className="text-xs text-[#444650]">
              Only tokens with status <strong>available</strong> can be used to schedule a makeup.
            </p>
          </div>
        </div>
      )
    }

    makeup = {
      tokenId:            t.id,
      riderId:            t.rider_id,
      riderName:          displayName(t.rider ?? {}),
      reason:             t.reason as 'rider_cancel' | 'barn_cancel' | 'admin_grant',
      originalLessonDate: t.origin?.scheduled_at?.slice(0, 10) ?? null,
      quarterLabel:       t.quarter?.label ?? '—',
      officialExpiresAt:  t.official_expires_at,
    }

    // Suggest the first upcoming makeup day within the token's quarter as the
    // default date — but admin can freely change it to any day.
    if (t.quarter?.start_date && t.quarter?.end_date) {
      const { data: days } = await supabase
        .from('barn_calendar_day')
        .select('date, is_makeup_day')
        .gte('date', t.quarter.start_date)
        .lte('date', t.quarter.end_date)
        .eq('is_makeup_day', true)
        .order('date')

      makeupDays = (days ?? []).map(d => d.date)
      const today = new Date().toISOString().slice(0, 10)
      suggestedDate = (days ?? []).find(d => d.date >= today)?.date
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link
          href={tokenId ? '/chia/lessons-events/tokens' : '/chia/lessons-events'}
          className="text-xs text-[#444650] hover:text-[#002058] hover:underline"
        >
          ← {tokenId ? 'Tokens' : 'Calendar'}
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">
          {tokenId ? 'Schedule Makeup' : 'New Lesson'}
        </h2>
        {!tokenId && (
          <p className="text-xs text-[#444650] mt-0.5">
            One-off lessons: evaluations and extras. Creates a single lesson + invoice line. For birthday parties, clinics, and other non-lesson activities, use New Event.
          </p>
        )}
      </div>

      <NewLessonProductForm
        riders={riders}
        billers={billers}
        instructors={instructors}
        horses={(horses ?? []).map(h => ({ id: h.id, name: h.barn_name }))}
        makeup={makeup}
        suggestedDate={clickedDate ?? suggestedDate}
        suggestedTime={clickedTime}
        makeupDays={makeupDays}
      />
    </div>
  )
}
