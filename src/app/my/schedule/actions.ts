'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type CancelOutcome =
  | 'cancelled_with_token'       // ≥24hrs, token granted
  | 'cancelled_no_allowance'     // ≥24hrs but standard rider used 2 already
  | 'cancelled_late'             // <24hrs, no token

export async function cancelMyLesson(
  lessonRiderId: string,
  reason?: string,
): Promise<{ outcome?: CancelOutcome; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db  = createAdminClient()
  const now = new Date()

  // Fetch lesson_rider + lesson + subscription in one query
  const { data: lr, error: lrErr } = await db
    .from('lesson_rider')
    .select(`
      id, rider_id, subscription_id, cancelled_at,
      lesson:lesson!lesson_id (
        id, scheduled_at, status, deleted_at, lesson_type
      ),
      subscription:lesson_subscription!subscription_id (
        subscription_type, quarter_id
      )
    `)
    .eq('id', lessonRiderId)
    .maybeSingle()

  if (lrErr || !lr) return { error: 'Lesson not found.' }

  // Security: rider must own this row
  if (lr.rider_id !== user.personId) return { error: 'Not authorized.' }
  if (lr.cancelled_at)               return { error: 'Already cancelled.' }

  const lesson = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson
  if (!lesson || lesson.deleted_at)    return { error: 'Lesson not found.' }
  if (lesson.status !== 'scheduled')   return { error: 'This lesson cannot be cancelled.' }

  const scheduledAt  = new Date(lesson.scheduled_at)
  const hoursUntil   = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60)
  const isInWindow   = hoursUntil >= 24

  const sub          = Array.isArray(lr.subscription) ? lr.subscription[0] : lr.subscription
  const isBoarder    = sub?.subscription_type === 'boarder'

  let grantToken = false
  let outcome: CancelOutcome

  if (!isInWindow) {
    outcome    = 'cancelled_late'
    grantToken = false
  } else if (isBoarder) {
    // Boarders get unlimited tokens — no allowance check
    outcome    = 'cancelled_with_token'
    grantToken = true
  } else {
    // Standard riders: 2 cancellations per quarter that count against allowance
    let cancelCount = 0
    const quarterId = sub?.quarter_id

    if (quarterId && lr.subscription_id) {
      // Find all subscription IDs for this rider in this quarter
      const { data: quarterSubs } = await db
        .from('lesson_subscription')
        .select('id')
        .eq('rider_id', user.personId)
        .eq('quarter_id', quarterId)
        .is('deleted_at', null)

      const subIds = (quarterSubs ?? []).map(s => s.id)

      if (subIds.length > 0) {
        const { count } = await db
          .from('lesson_rider')
          .select('id', { count: 'exact', head: true })
          .in('subscription_id', subIds)
          .not('cancelled_at', 'is', null)
          .eq('counts_against_allowance', true)
        cancelCount = count ?? 0
      }
    }

    if (cancelCount < 2) {
      outcome    = 'cancelled_with_token'
      grantToken = true
    } else {
      outcome    = 'cancelled_no_allowance'
      grantToken = false
    }
  }

  // --- Execute ---
  const nowStr = now.toISOString()

  const { error: cancelErr } = await db
    .from('lesson_rider')
    .update({ cancelled_at: nowStr, cancelled_by_id: user.personId, updated_at: nowStr })
    .eq('id', lessonRiderId)

  if (cancelErr) return { error: cancelErr.message }

  // Count remaining active riders on the lesson
  const { data: remaining } = await db
    .from('lesson_rider')
    .select('id')
    .eq('lesson_id', lesson.id)
    .is('cancelled_at', null)
    .is('deleted_at', null)

  const remainingCount = remaining?.length ?? 0

  if (remainingCount === 0) {
    // Last rider out — cancel the whole lesson
    await db
      .from('lesson')
      .update({
        status:              'cancelled_rider',
        cancelled_at:        nowStr,
        cancelled_by_id:     user.personId,
        cancellation_reason: reason ?? null,
        updated_at:          nowStr,
      })
      .eq('id', lesson.id)
  } else {
    // Downgrade lesson type for remaining riders
    const lesson_type = remainingCount === 1 ? 'private' : remainingCount === 2 ? 'semi_private' : 'group'
    await db
      .from('lesson')
      .update({ lesson_type, updated_at: nowStr })
      .eq('id', lesson.id)
  }

  // Grant makeup token if applicable
  if (grantToken && lr.subscription_id && sub?.quarter_id) {
    const { data: q } = await db
      .from('quarter')
      .select('end_date')
      .eq('id', sub.quarter_id)
      .maybeSingle()

    if (q?.end_date) {
      await db.from('makeup_token').insert({
        rider_id:            user.personId,
        subscription_id:     lr.subscription_id,
        original_lesson_id:  lesson.id,
        reason:              'rider_cancel',
        quarter_id:          sub.quarter_id,
        official_expires_at: q.end_date,
        status:              'available',
        created_by:          user.personId,
      })
    }
  }

  revalidatePath('/my/schedule')
  revalidatePath('/chia/lessons-events')

  return { outcome }
}

export async function requestCancellationException(
  lessonRiderId: string,
  message: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  // Verify ownership
  const db = createAdminClient()
  const { data: lr } = await db
    .from('lesson_rider')
    .select('id, rider_id, lesson:lesson!lesson_id(scheduled_at)')
    .eq('id', lessonRiderId)
    .maybeSingle()

  if (!lr || lr.rider_id !== user.personId) return { error: 'Not authorized.' }

  // Store the exception note on the lesson_rider as a cancellation with a reason tag
  // Admin will see it in CHIA and can grant a token manually
  const nowStr = new Date().toISOString()
  await db.from('lesson_rider').update({
    cancelled_at:     nowStr,
    cancelled_by_id:  user.personId,
    updated_at:       nowStr,
  }).eq('id', lessonRiderId)

  const lesson = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
  if (lesson?.id) {
    await db.from('lesson').update({
      cancellation_reason: message ? `Exception requested: ${message}` : 'Exception requested',
      cancelled_at:        nowStr,
      cancelled_by_id:     user.personId,
      status:              'cancelled_rider',
      updated_at:          nowStr,
    }).eq('id', lesson.id)
  }

  revalidatePath('/my/schedule')
  revalidatePath('/chia/lessons-events')

  return {}
}
