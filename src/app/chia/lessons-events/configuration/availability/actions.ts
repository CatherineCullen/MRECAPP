'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// Admin-scoped availability actions. Mirrors /my/teaching/actions.ts but takes
// an explicit instructorPersonId — admins can edit availability on behalf of
// any instructor. Instructor self-service still lives in /my/teaching.

const DAY_OF_WEEK = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const
type DayOfWeek = typeof DAY_OF_WEEK[number]

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in' as const }
  if (!user.isAdmin) return { error: 'Not authorized' as const }
  return { user }
}

export async function adminAddAvailabilityWindow(
  instructorPersonId: string,
  day: DayOfWeek,
  startTime: string,   // 'HH:MM'
  endTime: string,
): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!DAY_OF_WEEK.includes(day)) return { error: 'Invalid day' }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime))
    return { error: 'Invalid time' }
  if (endTime <= startTime) return { error: 'End time must be after start time' }

  const db = createAdminClient()

  // Confirm target person is actually an instructor — admins editing
  // availability for a non-instructor would be meaningless. Non-blocking
  // failure message keeps the UI honest.
  const { data: role } = await db
    .from('person_role')
    .select('person_id')
    .eq('person_id', instructorPersonId)
    .eq('role', 'instructor')
    .is('deleted_at', null)
    .maybeSingle()
  if (!role) return { error: 'Target person is not an instructor' }

  const today = new Date().toISOString().slice(0, 10)
  const { error } = await db.from('instructor_availability').insert({
    person_id:       instructorPersonId,
    day_of_week:     day,
    start_time:      startTime,
    end_time:        endTime,
    effective_from:  today,
    effective_until: null,
    created_by:      auth.user.personId,
  })

  if (error) return { error: 'Failed to add availability' }

  revalidatePath('/chia/lessons-events/configuration/availability')
  revalidatePath('/chia/lessons-events')
  revalidatePath('/my/teaching')
  return {}
}

export async function adminRemoveAvailabilityWindow(
  id: string,
): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const db = createAdminClient()
  const { data: row } = await db
    .from('instructor_availability')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!row) return { error: 'Not found' }

  const { error } = await db
    .from('instructor_availability')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: 'Failed to remove availability' }

  revalidatePath('/chia/lessons-events/configuration/availability')
  revalidatePath('/chia/lessons-events')
  revalidatePath('/my/teaching')
  return {}
}
