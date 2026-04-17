import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import GrantTokenForm from './_components/GrantTokenForm'
import { displayName } from '@/lib/displayName'

export default async function NewTokenPage() {
  const supabase = createAdminClient()

  const [{ data: people }, { data: subs }, { data: quarters }] = await Promise.all([
    supabase
      .from('person')
      .select(`
        id, first_name, last_name, preferred_name,
        person_role!person_role_person_id_fkey ( role )
      `)
      .is('deleted_at', null)
      .order('last_name'),
    supabase
      .from('lesson_subscription')
      .select(`
        id, rider_id, lesson_day, lesson_time,
        quarter:quarter ( id, label )
      `)
      .is('deleted_at', null),
    supabase
      .from('quarter')
      .select('id, label, start_date, end_date, is_active')
      .is('deleted_at', null)
      .order('start_date'),
  ])

  const riders = (people ?? [])
    .filter(p => (p.person_role ?? []).some((r: any) => r.role === 'rider'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  // Subscriptions indexed by rider so the form can show each rider's subs
  const subsByRider: Record<string, { id: string; label: string; quarter_id: string }[]> = {}
  for (const s of subs ?? []) {
    if (!s.rider_id) continue
    if (!subsByRider[s.rider_id]) subsByRider[s.rider_id] = []
    subsByRider[s.rider_id].push({
      id:         s.id,
      label:      `${s.quarter?.label ?? ''} · ${s.lesson_day} ${s.lesson_time?.slice(0, 5) ?? ''}`.trim(),
      quarter_id: s.quarter?.id ?? '',
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const openQuarters = (quarters ?? [])
    .filter(q => q.end_date >= today)
    .map(q => ({ id: q.id, label: q.label, is_active: q.is_active }))

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events/tokens" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Tokens
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">Grant Makeup Token</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Admin-grant tokens are for goodwill, edge cases, and cancellations not formally logged (e.g., last-minute instructor illness).
          For lesson-linked cancellations, use the lesson detail page instead.
        </p>
      </div>

      <GrantTokenForm
        riders={riders}
        subsByRider={subsByRider}
        quarters={openQuarters}
      />
    </div>
  )
}
