'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Mark a lesson as completed.
 * - Sets status = 'completed', completed_at = now()
 * - If this lesson was a scheduled makeup, marks the token as 'used'
 */
export async function completeLesson(lessonId: string): Promise<{ error?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('lesson')
    .update({
      status:       'completed',
      completed_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', lessonId)

  if (error) return { error: error.message }

  // If this was a makeup, mark its token used
  const { data: mkTok } = await supabase
    .from('makeup_token')
    .select('id')
    .eq('scheduled_lesson_id', lessonId)
    .eq('status', 'scheduled')
    .maybeSingle()

  if (mkTok) {
    await supabase
      .from('makeup_token')
      .update({ status: 'used', status_changed_at: new Date().toISOString() })
      .eq('id', mkTok.id)
  }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${lessonId}`)
  return {}
}

/**
 * Mark a lesson as no-show.
 * No token by default (same as late cancellation) unless admin grants manually.
 */
export async function markNoShow(lessonId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('lesson')
    .update({
      status:     'no_show',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId)

  if (error) return { error: error.message }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${lessonId}`)
  return {}
}

type CancelArgs = {
  lessonId:     string
  cancelledBy:  'rider' | 'barn'
  reason:       string
  grantTokens:  boolean
}

/**
 * Cancel a lesson.
 *
 *  - rider-cancel: status → 'cancelled_rider'
 *  - barn-cancel:  status → 'cancelled_barn'
 *
 * Token generation:
 *  - Barn-cancel: always generates a token for every active rider on the lesson
 *  - Rider-cancel: admin-controlled via `grantTokens`. When true, one token per rider.
 *    (The detailed ≥24hr/allowance rules live in the UI — the action just honors the decision.)
 */
export async function cancelLesson(args: CancelArgs): Promise<{ error?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()
  const now      = new Date().toISOString()

  // Need scheduled_at + instructor_id for token insertion; fetch alongside riders
  const { data: lesson, error: fetchErr } = await supabase
    .from('lesson')
    .select(`
      id, scheduled_at, status,
      lesson_rider (
        id, rider_id, subscription_id, cancelled_at,
        subscription:lesson_subscription ( id, quarter_id, subscription_type )
      )
    `)
    .eq('id', args.lessonId)
    .single()

  if (fetchErr || !lesson) return { error: fetchErr?.message ?? 'Lesson not found.' }

  const status = args.cancelledBy === 'barn' ? 'cancelled_barn' : 'cancelled_rider'

  const { error: updateErr } = await supabase
    .from('lesson')
    .update({
      status,
      cancellation_reason: args.reason || null,
      cancelled_at:        now,
      cancelled_by_id:     user?.personId ?? null,
      updated_at:          now,
    })
    .eq('id', args.lessonId)

  if (updateErr) return { error: updateErr.message }

  // Cancel each rider row on the lesson (so lesson_type auto-recalc etc. doesn't get confused)
  const activeRiders = (lesson.lesson_rider ?? []).filter(r => !r.cancelled_at)
  if (activeRiders.length > 0) {
    await supabase
      .from('lesson_rider')
      .update({ cancelled_at: now, cancelled_by_id: user?.personId ?? null, updated_at: now })
      .in('id', activeRiders.map(r => r.id))
  }

  // Token generation
  if (args.grantTokens && activeRiders.length > 0) {
    // Need the quarter end date to stamp official_expires_at
    const quarterIds = Array.from(new Set(activeRiders.map(r => r.subscription?.quarter_id).filter(Boolean) as string[]))
    const { data: quarters } = await supabase
      .from('quarter')
      .select('id, end_date')
      .in('id', quarterIds)
    const qEnd = new Map((quarters ?? []).map(q => [q.id, q.end_date]))

    const reason: 'barn_cancel' | 'rider_cancel' =
      args.cancelledBy === 'barn' ? 'barn_cancel' : 'rider_cancel'

    const tokenRows = activeRiders
      .filter(r => r.subscription_id && r.subscription?.quarter_id)
      .map(r => ({
        rider_id:            r.rider_id,
        subscription_id:     r.subscription_id,
        original_lesson_id:  args.lessonId,
        reason,
        quarter_id:          r.subscription!.quarter_id,
        official_expires_at: qEnd.get(r.subscription!.quarter_id)!,
        status:              'available' as const,
        created_by:          user?.personId ?? null,
      }))

    if (tokenRows.length > 0) {
      const { error: tokenErr } = await supabase.from('makeup_token').insert(tokenRows)
      if (tokenErr) return { error: `Lesson cancelled but token creation failed: ${tokenErr.message}` }
    }
  }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${args.lessonId}`)
  return {}
}

/**
 * Change the horse assigned to a specific rider on a specific lesson.
 * Writes to lesson_rider.horse_id — the authoritative per-lesson slot.
 * Passing null clears the assignment ("No horse").
 *
 * Does NOT update the subscription's default_horse_id — this is a per-lesson
 * override, matching the design (default seeds, admin/instructor adjusts day-of).
 */
export async function updateRiderHorse(args: {
  lessonId:       string
  lessonRiderId:  string
  horseId:        string | null
}): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('lesson_rider')
    .update({
      horse_id:   args.horseId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.lessonRiderId)
    .eq('lesson_id', args.lessonId)   // guard: can't cross-pollinate lessons

  if (error) return { error: error.message }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${args.lessonId}`)
  return {}
}

/**
 * Undo a terminal state (completed / cancelled / no-show), restoring the
 * lesson to 'scheduled'. Admin correction flow — e.g. mis-clicked Complete,
 * cancellation reversed because the lesson will run after all.
 *
 * For cancellations, any makeup tokens generated from this lesson are
 * hard-deleted (they were never real events — the rider doesn't know about
 * them since rider notifications aren't wired yet).
 */
export async function revertLesson(lessonId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const now      = new Date().toISOString()

  // Delete any tokens that originated from this lesson (if it was cancelled)
  await supabase
    .from('makeup_token')
    .delete()
    .eq('original_lesson_id', lessonId)

  // Un-cancel any lesson_rider rows
  await supabase
    .from('lesson_rider')
    .update({ cancelled_at: null, cancelled_by_id: null, updated_at: now })
    .eq('lesson_id', lessonId)
    .not('cancelled_at', 'is', null)

  // If this lesson was a makeup for another lesson, revert that token back
  // to 'available' so the rider still has their credit.
  const { data: token } = await supabase
    .from('makeup_token')
    .select('id')
    .eq('scheduled_lesson_id', lessonId)
    .eq('status', 'used')
    .maybeSingle()

  if (token) {
    await supabase
      .from('makeup_token')
      .update({ status: 'available', status_changed_at: now })
      .eq('id', token.id)
  }

  const { error } = await supabase
    .from('lesson')
    .update({
      status:              'scheduled',
      cancellation_reason: null,
      cancelled_at:        null,
      cancelled_by_id:     null,
      completed_at:        null,
      updated_at:          now,
    })
    .eq('id', lessonId)

  if (error) return { error: error.message }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${lessonId}`)
  revalidatePath('/chia/lessons-events/tokens')
  return {}
}

// ---------------------------------------------------------------------------
// Lesson type / duration ladder (shared by merge + per-rider cancel)
// ---------------------------------------------------------------------------

// Lesson type is derived from active rider count. duration_minutes is a
// GENERATED column on `lesson` (private=30, semi_private=45, group=60) — so
// never write it; Postgres rejects any non-DEFAULT value. Only update lesson_type.
function typeForRiderCount(n: number): 'private' | 'semi_private' | 'group' {
  if (n <= 1) return 'private'
  if (n === 2) return 'semi_private'
  return 'group'
}

/**
 * Merge one lesson into another. Moves every active LessonRider row from
 * `source` onto `target`, soft-deletes `source`, and recalculates `target`'s
 * lesson_type + duration_minutes from the new rider count.
 *
 * Scope:
 *   - 'just-this' — merges only the two lesson IDs passed in
 *   - 'quarter'   — additionally collapses every future scheduled lesson in
 *                   the same quarter at the same day-of-week + time +
 *                   instructor. If multiple candidate lessons exist on a
 *                   given future date, all of them merge into the
 *                   earliest-created one for that date.
 *
 * Validation: source and target must share exact scheduled_at + instructor_id,
 * both must be status='scheduled', and not already deleted. Anything else is
 * rejected — admin is expected to use this on pairs the calendar shows are
 * at the same slot.
 */
export async function mergeLessons(args: {
  sourceLessonId: string
  targetLessonId: string
  scope:          'just-this' | 'quarter'
}): Promise<{ error?: string; mergedCount?: number }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()
  const now      = new Date().toISOString()

  if (args.sourceLessonId === args.targetLessonId) {
    return { error: 'Cannot merge a lesson into itself.' }
  }

  // Validate both lessons up front
  const { data: pair, error: pairErr } = await supabase
    .from('lesson')
    .select('id, scheduled_at, instructor_id, status, deleted_at')
    .in('id', [args.sourceLessonId, args.targetLessonId])

  if (pairErr) return { error: pairErr.message }
  if (!pair || pair.length !== 2) return { error: 'Could not find both lessons.' }

  const target = pair.find(l => l.id === args.targetLessonId)!
  const source = pair.find(l => l.id === args.sourceLessonId)!

  if (target.deleted_at || source.deleted_at) return { error: 'One of these lessons was already deleted.' }
  if (target.status !== 'scheduled' || source.status !== 'scheduled') {
    return { error: 'Both lessons must be in Scheduled status to merge.' }
  }
  if (target.scheduled_at !== source.scheduled_at) {
    return { error: 'Lessons must be at the exact same date and time to merge.' }
  }
  if (target.instructor_id !== source.instructor_id) {
    return { error: 'Lessons must have the same instructor to merge.' }
  }

  // Step A: merge this pair
  const firstResult = await mergePair(supabase, args.sourceLessonId, args.targetLessonId, now, user?.personId ?? null)
  if (firstResult.error) return { error: firstResult.error }
  let mergedCount = 1

  // Step B: if scope is 'quarter', find and collapse all future scheduled
  // lessons at same day-of-week + time + instructor within the quarter
  if (args.scope === 'quarter') {
    const quarterId = await quarterIdForScheduledAt(supabase, target.scheduled_at)
    if (!quarterId) {
      // Can't determine quarter — the just-this merge still succeeded, but no bulk
      return { mergedCount }
    }
    const { data: quarter } = await supabase
      .from('quarter')
      .select('id, start_date, end_date')
      .eq('id', quarterId)
      .maybeSingle()
    if (!quarter) return { mergedCount }

    // Time-of-day + day-of-week from target.scheduled_at
    const targetDate = new Date(target.scheduled_at)
    const targetDow  = targetDate.getDay()            // 0..6
    const hh         = String(targetDate.getHours()).padStart(2, '0')
    const mm         = String(targetDate.getMinutes()).padStart(2, '0')
    const timeSuffix = `T${hh}:${mm}:00`

    // Walk forward week-by-week from the target's date + 7 until quarter end
    const quarterEnd = new Date(`${quarter.end_date}T23:59:59`)
    const cursor = new Date(targetDate)
    cursor.setDate(cursor.getDate() + 7)              // skip the week we just merged

    while (cursor <= quarterEnd) {
      // Find all scheduled lessons at this exact slot + instructor
      const isoAt = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}${timeSuffix}`

      const { data: candidates } = await supabase
        .from('lesson')
        .select('id, created_at')
        .eq('scheduled_at', isoAt)
        .eq('instructor_id', target.instructor_id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (candidates && candidates.length >= 2) {
        // Keep the earliest-created, dissolve the rest into it
        const [keep, ...dissolve] = candidates
        for (const d of dissolve) {
          const r = await mergePair(supabase, d.id, keep.id, now, user?.personId ?? null)
          if (r.error) return { error: `Failed bulk merge on ${isoAt}: ${r.error}`, mergedCount }
          mergedCount += 1
        }
      }

      cursor.setDate(cursor.getDate() + 7)
      // Defensive: avoid infinite loop if DOW drifted somehow
      if (cursor.getDay() !== targetDow) break
    }
  }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${args.targetLessonId}`)
  revalidatePath(`/chia/lessons-events/${args.sourceLessonId}`)
  return { mergedCount }
}

/**
 * Internal: merge one pair. Assumes both already validated by caller.
 * Exposed only through `mergeLessons`.
 */
async function mergePair(
  supabase: ReturnType<typeof createAdminClient>,
  sourceId: string,
  targetId: string,
  now: string,
  actorId: string | null,
): Promise<{ error?: string }> {
  // Move active lesson_rider rows from source → target
  const { error: moveErr } = await supabase
    .from('lesson_rider')
    .update({ lesson_id: targetId, updated_at: now })
    .eq('lesson_id', sourceId)
    .is('cancelled_at', null)
  if (moveErr) return { error: moveErr.message }

  // Soft-delete the source lesson
  const { error: delErr } = await supabase
    .from('lesson')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', sourceId)
  if (delErr) return { error: delErr.message }

  // Recount active riders on target and update type + duration
  const { data: activeRiders } = await supabase
    .from('lesson_rider')
    .select('id')
    .eq('lesson_id', targetId)
    .is('cancelled_at', null)

  const n = activeRiders?.length ?? 0
  const lesson_type = typeForRiderCount(n)

  const { error: updErr } = await supabase
    .from('lesson')
    .update({ lesson_type, updated_at: now })
    .eq('id', targetId)
  if (updErr) return { error: updErr.message }

  void actorId  // reserved for audit if we add it later
  return {}
}

async function quarterIdForScheduledAt(
  supabase: ReturnType<typeof createAdminClient>,
  scheduledAt: string,
): Promise<string | null> {
  const date = scheduledAt.slice(0, 10)   // YYYY-MM-DD
  const { data } = await supabase
    .from('quarter')
    .select('id')
    .lte('start_date', date)
    .gte('end_date', date)
    .is('deleted_at', null)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Cancel ONE rider from a multi-rider lesson. If the rider was the last
 * active one, the whole lesson is cancelled (same as cancelLesson). Otherwise
 * the lesson's lesson_type + duration auto-downgrade and it stays on the
 * schedule for the other riders.
 *
 * Token generation mirrors cancelLesson: caller passes `grantToken`.
 */
export async function cancelRider(args: {
  lessonId:      string
  lessonRiderId: string
  cancelledBy:   'rider' | 'barn'
  reason:        string
  grantToken:    boolean
}): Promise<{ error?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()
  const now      = new Date().toISOString()

  const { data: lesson, error: fetchErr } = await supabase
    .from('lesson')
    .select(`
      id, scheduled_at, status, deleted_at,
      lesson_rider (
        id, rider_id, subscription_id, cancelled_at,
        subscription:lesson_subscription ( id, quarter_id )
      )
    `)
    .eq('id', args.lessonId)
    .maybeSingle()

  if (fetchErr || !lesson) return { error: fetchErr?.message ?? 'Lesson not found.' }
  if (lesson.deleted_at) return { error: 'Lesson was deleted.' }
  if (lesson.status !== 'scheduled') return { error: 'Lesson is not in Scheduled status.' }

  const target = (lesson.lesson_rider ?? []).find(r => r.id === args.lessonRiderId)
  if (!target) return { error: 'Rider not found on this lesson.' }
  if (target.cancelled_at) return { error: 'Rider already cancelled on this lesson.' }

  // Cancel the rider row
  const { error: cancelErr } = await supabase
    .from('lesson_rider')
    .update({ cancelled_at: now, cancelled_by_id: user?.personId ?? null, updated_at: now })
    .eq('id', args.lessonRiderId)
  if (cancelErr) return { error: cancelErr.message }

  // Count remaining active riders
  const remaining = (lesson.lesson_rider ?? []).filter(r => !r.cancelled_at && r.id !== args.lessonRiderId)

  if (remaining.length === 0) {
    // Last rider out → cancel the whole lesson
    const status = args.cancelledBy === 'barn' ? 'cancelled_barn' : 'cancelled_rider'
    await supabase
      .from('lesson')
      .update({
        status,
        cancellation_reason: args.reason || null,
        cancelled_at:        now,
        cancelled_by_id:     user?.personId ?? null,
        updated_at:          now,
      })
      .eq('id', args.lessonId)
  } else {
    // Others remain — recalc type. duration_minutes is generated from
    // lesson_type so it updates itself.
    const lesson_type = typeForRiderCount(remaining.length)
    await supabase
      .from('lesson')
      .update({ lesson_type, updated_at: now })
      .eq('id', args.lessonId)
  }

  // Grant token if requested (same rules as cancelLesson — caller decides)
  if (args.grantToken && target.subscription_id && target.subscription?.quarter_id) {
    const { data: q } = await supabase
      .from('quarter')
      .select('end_date')
      .eq('id', target.subscription.quarter_id)
      .maybeSingle()
    if (q?.end_date) {
      const reason: 'barn_cancel' | 'rider_cancel' =
        args.cancelledBy === 'barn' ? 'barn_cancel' : 'rider_cancel'
      await supabase.from('makeup_token').insert({
        rider_id:            target.rider_id,
        subscription_id:     target.subscription_id,
        original_lesson_id:  args.lessonId,
        reason,
        quarter_id:          target.subscription.quarter_id,
        official_expires_at: q.end_date,
        status:              'available',
        created_by:          user?.personId ?? null,
      })
    }
  }

  revalidatePath('/chia/lessons-events')
  revalidatePath(`/chia/lessons-events/${args.lessonId}`)
  revalidatePath('/chia/lessons-events/tokens')
  return {}
}
