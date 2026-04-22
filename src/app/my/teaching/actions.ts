'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function updateHorseAssignment(
  lessonRiderId: string,
  horseId: string | null,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }
  if (!user.isInstructor && !user.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()

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

const DAY_OF_WEEK = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const
type DayOfWeek = typeof DAY_OF_WEEK[number]

export async function addAvailabilityWindow(
  day: DayOfWeek,
  startTime: string,   // 'HH:MM'
  endTime: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }
  if (!user.isInstructor && !user.isAdmin) return { error: 'Not authorized' }
  if (!DAY_OF_WEEK.includes(day)) return { error: 'Invalid day' }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime))
    return { error: 'Invalid time' }
  if (endTime <= startTime) return { error: 'End time must be after start time' }

  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { error } = await db.from('instructor_availability').insert({
    person_id:       user.personId,
    day_of_week:     day,
    start_time:      startTime,
    end_time:        endTime,
    effective_from:  today,
    effective_until: null,
    created_by:      user.personId,
  })

  if (error) return { error: 'Failed to add availability' }

  revalidatePath('/my/teaching')
  revalidatePath('/chia/lessons-events')
  return {}
}

export async function removeAvailabilityWindow(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }
  if (!user.isInstructor && !user.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()
  const { data: row } = await db
    .from('instructor_availability')
    .select('id, person_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!row) return { error: 'Not found' }
  if (row.person_id !== user.personId && !user.isAdmin)
    return { error: 'You can only edit your own availability' }

  const { error } = await db
    .from('instructor_availability')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: 'Failed to remove availability' }

  revalidatePath('/my/teaching')
  revalidatePath('/chia/lessons-events')
  return {}
}

export async function updateLessonNote(
  lessonId: string,
  note: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' }
  if (!user.isInstructor && !user.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()

  const { data: lesson } = await db
    .from('lesson')
    .select('id, instructor_id')
    .eq('id', lessonId)
    .is('deleted_at', null)
    .single()

  if (!lesson) return { error: 'Lesson not found' }
  if (lesson.instructor_id !== user.personId && !user.isAdmin)
    return { error: 'You can only add notes to your own lessons' }

  const trimmed = note.trim()
  const { error } = await db
    .from('lesson')
    .update({ notes: trimmed || null })
    .eq('id', lessonId)

  if (error) return { error: 'Failed to save note' }

  revalidatePath('/my/teaching')
  return {}
}
