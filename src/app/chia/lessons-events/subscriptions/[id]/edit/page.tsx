import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'
import EditSubscriptionForm from './_components/EditSubscriptionForm'

export default async function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const nowIso   = new Date().toISOString()

  const [{ data: sub, error }, { data: people }, { data: horses }, { data: futureRiderRows }] = await Promise.all([
    supabase
      .from('lesson_subscription')
      .select(`
        id, billed_to_id, subscription_type, subscription_price, status,
        default_horse_id, is_prorated, prorated_price, prorated_lesson_count,
        lesson_day, lesson_time,
        rider:person!lesson_subscription_rider_id_fkey ( id, first_name, last_name, preferred_name ),
        instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name ),
        horse:horse ( id, barn_name ),
        quarter ( id, label )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('person')
      .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name'),
    supabase
      .from('horse')
      .select('id, barn_name')
      .is('deleted_at', null)
      .order('barn_name'),
    // Count future, still-scheduled lessons on this subscription (for the
    // "Cancel N remaining lessons" button label)
    supabase
      .from('lesson_rider')
      .select('id, lesson:lesson!inner ( status, scheduled_at )')
      .eq('subscription_id', id)
      .is('cancelled_at', null)
      .gte('lesson.scheduled_at', nowIso),
  ])

  if (error) throw error
  if (!sub) notFound()

  const futureLessonCount = (futureRiderRows ?? [])
    .filter(r => (r.lesson as any)?.status === 'scheduled')
    .length

  const billers = (people ?? []).map(p => ({ id: p.id, name: displayName(p) }))
  const horseOptions = (horses ?? []).map(h => ({ id: h.id, name: h.barn_name }))

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <Link href="/chia/lessons-events/subscriptions" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Subscriptions
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">Edit Subscription</h2>
        <p className="text-xs text-[#444650] mt-0.5">
          Price, horse, billing, and status can be changed in place. Day / time / instructor changes require cancelling the remaining lessons.
        </p>
      </div>

      <EditSubscriptionForm
        subscription={{
          id:                    sub.id,
          rider_name:            displayName(sub.rider),
          instructor_name:       displayName(sub.instructor),
          quarter_label:         (sub.quarter as any)?.label ?? '—',
          lesson_day:            sub.lesson_day,
          lesson_time:           sub.lesson_time,
          billed_to_id:          sub.billed_to_id,
          subscription_type:     sub.subscription_type as 'standard' | 'boarder',
          subscription_price:    Number(sub.subscription_price),
          default_horse_id:      sub.default_horse_id,
          default_horse_name:    (sub.horse as any)?.barn_name ?? null,
          is_prorated:           !!sub.is_prorated,
          prorated_price:        sub.prorated_price != null ? Number(sub.prorated_price) : null,
          prorated_lesson_count: sub.prorated_lesson_count ?? null,
          status:                sub.status as 'pending' | 'active' | 'cancelled' | 'completed',
        }}
        futureLessonCount={futureLessonCount}
        billers={billers}
        horses={horseOptions}
      />
    </div>
  )
}
