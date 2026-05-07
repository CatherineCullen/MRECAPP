import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import GrantTokenForm from './_components/GrantTokenForm'
import { displayName } from '@/lib/displayName'

export default async function NewTokenPage() {
  const supabase = createAdminClient()

  const [{ data: people }, { data: subs }] = await Promise.all([
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
      .select('id, rider_id, lesson_day, lesson_time, status')
      .is('deleted_at', null)
      .in('status', ['pending', 'active']),
  ])

  const riders = (people ?? [])
    .filter(p => (p.person_role ?? []).some((r: any) => r.role === 'rider'))
    .map(p => ({ id: p.id, name: displayName(p) }))

  // Subscriptions indexed by rider so the form can show each rider's subs
  const subsByRider: Record<string, { id: string; label: string }[]> = {}
  for (const s of subs ?? []) {
    if (!s.rider_id) continue
    if (!subsByRider[s.rider_id]) subsByRider[s.rider_id] = []
    subsByRider[s.rider_id].push({
      id:    s.id,
      label: `${s.lesson_day} ${s.lesson_time?.slice(0, 5) ?? ''}`.trim(),
    })
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events/tokens" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Tokens
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">Grant Makeup Token</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Admin-grant tokens are for goodwill, edge cases, and cancellations not formally logged (e.g., last-minute instructor illness).
          For lesson-linked cancellations, use the lesson detail page instead. Tokens expire 10 days from issuance (ADR-0020).
        </p>
      </div>

      <GrantTokenForm
        riders={riders}
        subsByRider={subsByRider}
      />
    </div>
  )
}
