'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// Which fields on a subscription are metadata-editable.
// Slot (day/time/instructor) is deliberately NOT here — changing the slot is
// done via batch-cancel-remaining + reschedule-from-tokens. See the cancel
// action below.
type UpdateArgs = {
  subscriptionId:        string
  billedToId:            string
  subscriptionType:      'standard' | 'boarder'
  subscriptionPrice:     number
  defaultHorseId:        string | null
  isProrated:            boolean
  proratedPrice:         number | null
  proratedLessonCount:   number | null
  status:                'pending' | 'active' | 'cancelled' | 'completed'
  makeupNotes:           string | null
  renewalIntent:         'renewing' | 'not_renewing'
  /** When true, also push the new default_horse_id onto future lesson_rider
   *  rows that currently point at the OLD default. Per-lesson overrides are
   *  preserved. */
  cascadeDefaultHorse:   boolean
}

export async function updateSubscription(args: UpdateArgs): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const now      = new Date().toISOString()

  // Fetch existing so we can detect horse changes and cascade if asked
  const { data: existing, error: fetchErr } = await supabase
    .from('lesson_subscription')
    .select('id, default_horse_id, rider_id')
    .eq('id', args.subscriptionId)
    .maybeSingle()

  if (fetchErr || !existing) return { error: fetchErr?.message ?? 'Subscription not found.' }

  const { error } = await supabase
    .from('lesson_subscription')
    .update({
      billed_to_id:          args.billedToId,
      subscription_type:     args.subscriptionType,
      subscription_price:    args.subscriptionPrice,
      default_horse_id:      args.defaultHorseId,
      is_prorated:           args.isProrated,
      prorated_price:        args.isProrated ? args.proratedPrice : null,
      prorated_lesson_count: args.isProrated ? args.proratedLessonCount : null,
      status:                args.status,
      makeup_notes:          args.makeupNotes,
      renewal_intent:        args.renewalIntent,
      updated_at:            now,
    })
    .eq('id', args.subscriptionId)

  if (error) return { error: error.message }

  // Cascade default-horse change to future lessons whose rider row still
  // points at the old default (i.e., wasn't manually overridden). Past lessons
  // are historical and stay as-is.
  if (args.cascadeDefaultHorse && existing.default_horse_id !== args.defaultHorseId) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: futureRiders } = await supabase
      .from('lesson_rider')
      .select('id, lesson:lesson!inner ( scheduled_at, status )')
      .eq('subscription_id', args.subscriptionId)
      .eq('horse_id', existing.default_horse_id ?? '')   // '' is safe — uuid col never matches
      .is('cancelled_at', null)
      .gte('lesson.scheduled_at', today)

    const idsToUpdate = (futureRiders ?? [])
      .filter(r => (r.lesson as any)?.status === 'scheduled')
      .map(r => r.id)

    if (idsToUpdate.length > 0) {
      await supabase
        .from('lesson_rider')
        .update({ horse_id: args.defaultHorseId, updated_at: now })
        .in('id', idsToUpdate)
    }
  }

  revalidatePath('/chia/lessons-events')
  revalidatePath('/chia/lessons-events/subscriptions')
  revalidatePath(`/chia/lessons-events/subscriptions/${args.subscriptionId}/edit`)
  return {}
}

/**
 * Batch barn-cancel every future scheduled lesson this subscription owns,
 * issuing a makeup token for each. The admin uses this to "end" the
 * subscription's slot — they then reschedule the tokens at the new slot via
 * the existing token → product flow.
 *
 * Cutoff: anything scheduled from NOW forward. Past lessons and already-
 * cancelled/completed lessons are left alone.
 *
 * Merged lessons: if a future lesson has other active riders (semi-private /
 * group), only THIS rider's lesson_rider row is cancelled. The lesson stays
 * alive for the others and its lesson_type + duration are recalculated down.
 *
 * If zero future lessons remain on the subscription after this runs, the
 * subscription's own status flips to 'cancelled'.
 */
export async function cancelRemainingLessons(args: {
  subscriptionId: string
  reason:         string
  /** When false, lessons are cancelled without issuing makeup tokens — used
   *  for never-paid pending subscriptions or the rare refund-and-release case.
   *  Defaults to true (standard slot-change flow). */
  grantTokens?:   boolean
}): Promise<{ error?: string; cancelledCount?: number; tokensIssued?: number }> {
  const grantTokens = args.grantTokens ?? true
  const user     = await getCurrentUser()
  const supabase = createAdminClient()
  const now      = new Date().toISOString()
  const nowIso   = now

  const { data: sub, error: subErr } = await supabase
    .from('lesson_subscription')
    .select('id, rider_id, quarter_id, quarter:quarter ( end_date )')
    .eq('id', args.subscriptionId)
    .maybeSingle()

  if (subErr || !sub) return { error: subErr?.message ?? 'Subscription not found.' }
  const quarterEnd = (sub.quarter as any)?.end_date as string | undefined
  if (!quarterEnd) return { error: 'Quarter end date missing.' }

  // Pull every future, still-active lesson_rider row owned by this subscription
  const { data: riderRows, error: riderErr } = await supabase
    .from('lesson_rider')
    .select(`
      id, lesson_id, rider_id,
      lesson:lesson!inner ( id, scheduled_at, status, lesson_rider ( id, cancelled_at ) )
    `)
    .eq('subscription_id', args.subscriptionId)
    .is('cancelled_at', null)
    .gte('lesson.scheduled_at', nowIso)

  if (riderErr) return { error: riderErr.message }

  // Filter to only lessons still in a cancellable state (scheduled/pending-ish)
  const eligible = (riderRows ?? []).filter(r => {
    const status = (r.lesson as any)?.status
    return status === 'scheduled'
  })

  if (eligible.length === 0) {
    // Nothing to cancel — maybe flip status if already empty
    await maybeFlipSubscriptionToCancelled(supabase, args.subscriptionId)
    return { cancelledCount: 0, tokensIssued: 0 }
  }

  // 1) Cancel each rider row
  const riderRowIds = eligible.map(r => r.id)
  const { error: lrErr } = await supabase
    .from('lesson_rider')
    .update({ cancelled_at: now, cancelled_by_id: user?.personId ?? null, updated_at: now })
    .in('id', riderRowIds)
  if (lrErr) return { error: lrErr.message }

  // 2) For each affected lesson, figure out whether it's now fully cancelled
  //    (no active riders left) or needs a lesson_type recalc for the remaining riders
  const affectedLessonIds = Array.from(new Set(eligible.map(r => r.lesson_id)))
  const { data: lessons } = await supabase
    .from('lesson')
    .select('id, status, lesson_rider ( id, cancelled_at, deleted_at )')
    .in('id', affectedLessonIds)

  const lessonsToCancel: string[] = []
  // duration_minutes is a GENERATED column on `lesson` (derived from
  // lesson_type). Never write to it — update lesson_type only and Postgres
  // fills in duration.
  const typeUpdates: { id: string; lesson_type: 'private' | 'semi_private' | 'group' }[] = []

  for (const l of lessons ?? []) {
    // Count active riders AFTER our cancellation (the update above is committed)
    const activeRemaining = (l.lesson_rider ?? []).filter(r => !r.cancelled_at && !r.deleted_at).length
    if (activeRemaining === 0) {
      lessonsToCancel.push(l.id)
    } else {
      // Auto-downgrade lesson_type based on remaining count
      const type = activeRemaining === 1
        ? 'private' as const
        : activeRemaining === 2
          ? 'semi_private' as const
          : 'group' as const
      typeUpdates.push({ id: l.id, lesson_type: type })
    }
  }

  // 3) Cancel the fully-empty lessons
  if (lessonsToCancel.length > 0) {
    await supabase
      .from('lesson')
      .update({
        status:              'cancelled_barn',
        cancellation_reason: args.reason || 'Subscription slot change',
        cancelled_at:        now,
        cancelled_by_id:     user?.personId ?? null,
        updated_at:          now,
      })
      .in('id', lessonsToCancel)
  }

  // 4) Recalc type/duration on merged lessons that still have riders
  for (const u of typeUpdates) {
    await supabase
      .from('lesson')
      .update({ lesson_type: u.lesson_type, updated_at: now })
      .eq('id', u.id)
  }

  // 5) Issue one makeup token per cancelled rider row — unless the admin
  //    opted out (grantTokens=false), e.g. a pending sub that was never paid
  //    or a rare refund-and-release case.
  const tokenRows = grantTokens
    ? eligible.map(r => ({
        rider_id:            r.rider_id,
        subscription_id:     args.subscriptionId,
        original_lesson_id:  r.lesson_id,
        reason:              'barn_cancel' as const,
        quarter_id:          sub.quarter_id,
        official_expires_at: quarterEnd,
        status:              'available' as const,
        created_by:          user?.personId ?? null,
      }))
    : []

  if (tokenRows.length > 0) {
    const { error: tokenErr } = await supabase.from('makeup_token').insert(tokenRows)
    if (tokenErr) return { error: `Lessons cancelled but token creation failed: ${tokenErr.message}` }
  }

  // 6) If the subscription now has zero active future lessons, auto-flip to cancelled
  await maybeFlipSubscriptionToCancelled(supabase, args.subscriptionId)

  revalidatePath('/chia/lessons-events')
  revalidatePath('/chia/lessons-events/subscriptions')
  revalidatePath('/chia/lessons-events/tokens')
  revalidatePath(`/chia/lessons-events/subscriptions/${args.subscriptionId}/edit`)

  return { cancelledCount: eligible.length, tokensIssued: tokenRows.length }
}

async function maybeFlipSubscriptionToCancelled(
  supabase: ReturnType<typeof createAdminClient>,
  subscriptionId: string,
) {
  const nowIso = new Date().toISOString()
  const { data: remaining } = await supabase
    .from('lesson_rider')
    .select('id, lesson:lesson!inner ( status, scheduled_at )')
    .eq('subscription_id', subscriptionId)
    .is('cancelled_at', null)
    .is('deleted_at', null)
    .gte('lesson.scheduled_at', nowIso)

  const stillActive = (remaining ?? []).some(r => (r.lesson as any)?.status === 'scheduled')
  if (!stillActive) {
    await supabase
      .from('lesson_subscription')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('id', subscriptionId)
  }
}
