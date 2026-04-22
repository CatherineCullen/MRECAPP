'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function cancelInstructorLesson(lessonId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }
  if (!user.isInstructor && !user.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()
  const now = new Date()

  // Fetch the lesson — verify it belongs to this instructor and is in the future
  const { data: lesson, error: fetchErr } = await db
    .from('lesson')
    .select('id, scheduled_at, status, instructor_id')
    .eq('id', lessonId)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !lesson) return { error: 'Lesson not found' }
  if (lesson.instructor_id !== user.personId && !user.isAdmin)
    return { error: 'You can only cancel your own lessons' }
  if (new Date(lesson.scheduled_at) <= now)
    return { error: 'Past lessons can only be cancelled by an admin' }
  if (lesson.status !== 'scheduled')
    return { error: 'Lesson is not scheduled' }

  // Cancel the lesson as barn-cancel
  const { error: cancelErr } = await db
    .from('lesson')
    .update({
      status:          'cancelled_barn',
      cancelled_at:    now.toISOString(),
      cancelled_by_id: user.personId,
    })
    .eq('id', lessonId)

  if (cancelErr) return { error: 'Failed to cancel lesson' }

  // Stamp cancelled_at on active lesson_riders
  const { data: riders } = await db
    .from('lesson_rider')
    .select('id, rider_id, subscription_id')
    .eq('lesson_id', lessonId)
    .is('cancelled_at', null)
    .is('deleted_at', null)

  if (riders?.length) {
    await db
      .from('lesson_rider')
      .update({ cancelled_at: now.toISOString() })
      .in('id', riders.map(r => r.id))

    // Create makeup tokens for subscription riders (barn cancel = always a token)
    const subscriptionRiders = riders.filter(r => r.subscription_id)
    if (subscriptionRiders.length) {
      // Get quarter info from the subscriptions to set expiry
      const subIds = subscriptionRiders.map(r => r.subscription_id).filter(Boolean) as string[]
      const { data: subs } = await db
        .from('lesson_subscription')
        .select('id, quarter_id, quarter:quarter!quarter_id(end_date)')
        .in('id', subIds)

      const subQuarterMap = new Map<string, { quarterId: string; endDate: string }>()
      for (const s of subs ?? []) {
        const q = Array.isArray(s.quarter) ? s.quarter[0] : s.quarter as any
        if (q?.end_date) subQuarterMap.set(s.id, { quarterId: s.quarter_id, endDate: q.end_date })
      }

      for (const r of subscriptionRiders) {
        const quarterInfo = r.subscription_id ? subQuarterMap.get(r.subscription_id) : null
        if (!quarterInfo) continue
        await db.from('makeup_token').insert({
          rider_id:            r.rider_id,
          original_lesson_id:  lessonId,
          status:              'available',
          reason:              'barn_cancel',
          quarter_id:          quarterInfo.quarterId,
          official_expires_at: quarterInfo.endDate,
          created_by:          user.personId,
        })
      }
    }
  }

  revalidatePath('/my/teaching')
  return {}
}

export async function updateHorseAssignment(
  lessonRiderId: string,
  horseId: string | null,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }
  if (!user.isInstructor && !user.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()

  // Verify this lesson_rider belongs to a lesson taught by this instructor
  const { data: lr } = await db
    .from('lesson_rider')
    .select('id, lesson:lesson!lesson_id(instructor_id)')
    .eq('id', lessonRiderId)
    .is('deleted_at', null)
    .single()

  if (!lr) return { error: 'Lesson rider not found' }
  const lesson = Array.isArray(lr.lesson) ? lr.lesson[0] : lr.lesson as any
  if (lesson?.instructor_id !== user.personId && !user.isAdmin)
    return { error: 'You can only adjust horses on your own lessons' }

  const { error } = await db
    .from('lesson_rider')
    .update({ horse_id: horseId })
    .eq('id', lessonRiderId)

  if (error) return { error: 'Failed to update horse assignment' }

  revalidatePath('/my/teaching')
  return {}
}
