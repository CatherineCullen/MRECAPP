'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { sendMessage } from '@/lib/messaging/messages'
import { formatBarnDateTime } from '@/lib/datetime'

export type CancelOutcome =
  | 'cancelled_with_token'       // ≥24hrs, token granted
  | 'cancelled_no_allowance'     // ≥24hrs but standard rider used 2 already
  | 'cancelled_late'             // <24hrs, no token

/**
 * Rider self-service cancel. Optional `note` becomes a thread message
 * tagged to the cancelled lesson, with a system_prefix that contains
 * the lesson date/time + "Cancelled by rider" so the instructor sees
 * context without cross-referencing their schedule.
 *
 * If the lesson is in-window (≥24hrs), a makeup token is granted under
 * the existing rules (boarders unlimited, standard riders 2/quarter).
 * Late cancels do not auto-grant. Admin reads the note in the thread
 * and decides whether to grant manually.
 */
export async function cancelMyLesson(
  lessonRiderId: string,
  note?: string,
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
  } else if (!lr.subscription_id) {
    // Migration-era / unlinked lesson: no subscription means no allowance
    // count to enforce. Grant a token unconditionally if in-window.
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
    // Last rider out — cancel the whole lesson. Cancellation reason is
    // no longer written to the lesson row; it lives in the tagged
    // message instead (queried by lesson_id at display time).
    await db
      .from('lesson')
      .update({
        status:              'cancelled_rider',
        cancelled_at:        nowStr,
        cancelled_by_id:     user.personId,
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

  // Grant makeup token if applicable. Riders without a subscription (legacy /
  // migration-era lessons) still get tokens — quarter_id is derived from the
  // lesson's scheduled_at and subscription_id is left null.
  if (grantToken) {
    let quarterId = sub?.quarter_id ?? null
    if (!quarterId) {
      const date = lesson.scheduled_at.slice(0, 10)
      const { data: qRow } = await db
        .from('quarter')
        .select('id')
        .lte('start_date', date)
        .gte('end_date', date)
        .is('deleted_at', null)
        .maybeSingle()
      quarterId = qRow?.id ?? null
    }

    if (quarterId) {
      const { data: q } = await db
        .from('quarter')
        .select('end_date')
        .eq('id', quarterId)
        .maybeSingle()

      if (q?.end_date) {
        await db.from('makeup_token').insert({
          rider_id:            user.personId,
          subscription_id:     lr.subscription_id,
          original_lesson_id:  lesson.id,
          reason:              'rider_cancel',
          quarter_id:          quarterId,
          official_expires_at: q.end_date,
          status:              'available',
          created_by:          user.personId,
        })
      }
    }
  }

  // If the rider typed a note, post it as a thread message tagged to
  // this lesson. The instructor sees the cancel context in their thread
  // (via system_prefix) and the lesson detail page in CHIA queries
  // tagged messages to show admin the same context. One source of
  // truth, two surfaces.
  if (note?.trim()) {
    try {
      const prefix = `${formatBarnDateTime(lesson.scheduled_at)} · Cancelled by rider`
      // Resolve the instructor recipient from the lesson row.
      const { data: lessonRow } = await db
        .from('lesson')
        .select('instructor_id')
        .eq('id', lesson.id)
        .maybeSingle()
      if (lessonRow?.instructor_id) {
        await sendMessage({
          senderId:             user.personId,
          recipientId:          lessonRow.instructor_id,
          body:                 note.trim(),
          lessonId:             lesson.id,
          systemPrefix:         prefix,
          skipEligibilityCheck: true, // they had a lesson together — eligibility is implicit
        })
      }
    } catch (err) {
      // Don't fail the cancel because the message couldn't post.
      // Log and move on; admin can still see the lesson is cancelled.
      console.error('[cancelMyLesson] Failed to post cancel note as message', err)
    }
  }

  revalidatePath('/my/schedule')
  revalidatePath('/chia/lessons-events')

  return { outcome }
}
