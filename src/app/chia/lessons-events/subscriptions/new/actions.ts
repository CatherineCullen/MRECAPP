'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { DayOfWeek } from '../../_lib/generateLessonDates'

type CreateArgs = {
  riderId:           string
  billedToId:        string
  instructorId:      string
  quarterId:         string
  dayOfWeek:         DayOfWeek
  lessonTime:        string         // "HH:MM"
  defaultHorseId:    string | null
  subscriptionType:  'standard' | 'boarder'
  subscriptionPrice: number
  startDate:         string         // 'YYYY-MM-DD'
  lessonDates:       string[]       // dates the admin confirmed (subset of generated)
  isProrated:        boolean
  proratedPrice:     number | null
}

export async function createSubscription(args: CreateArgs): Promise<{ error?: string; subscriptionId?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  if (args.lessonDates.length === 0) {
    return { error: 'No lesson dates to create.' }
  }

  // 0) Ensure the rider has the 'rider' role. Enrolling someone in a
  //    subscription implicitly makes them a rider — we auto-assign so the
  //    admin doesn't have to round-trip through the People form first.
  //    Idempotent: skips if they already have the role.
  const { data: existingRole } = await supabase
    .from('person_role')
    .select('id, deleted_at')
    .eq('person_id', args.riderId)
    .eq('role', 'rider' as any)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existingRole) {
    await supabase
      .from('person_role')
      .insert({ person_id: args.riderId, role: 'rider' as any })
  } else if (existingRole.deleted_at) {
    await supabase
      .from('person_role')
      .update({ deleted_at: null, assigned_at: new Date().toISOString() })
      .eq('id', existingRole.id)
  }

  // 1) Insert the subscription row
  const { data: sub, error: subErr } = await supabase
    .from('lesson_subscription')
    .insert({
      rider_id:              args.riderId,
      billed_to_id:          args.billedToId,
      quarter_id:            args.quarterId,
      lesson_day:            args.dayOfWeek,
      lesson_time:           args.lessonTime,
      instructor_id:         args.instructorId,
      default_horse_id:      args.defaultHorseId,
      subscription_price:    args.subscriptionPrice,
      is_prorated:           args.isProrated,
      prorated_lesson_count: args.isProrated ? args.lessonDates.length : null,
      prorated_price:        args.isProrated ? args.proratedPrice : null,
      subscription_type:     args.subscriptionType,
      status:                'pending',
      created_by:            user?.personId ?? null,
    })
    .select('id')
    .single()

  if (subErr || !sub) {
    return { error: subErr?.message ?? 'Failed to create subscription.' }
  }

  // 2) Insert one `lesson` row per date
  //    Each lesson gets its own UUID from the DB; we need the IDs back so we
  //    can tie lesson_rider rows to them.
  const lessonRows = args.lessonDates.map(date => ({
    instructor_id: args.instructorId,
    lesson_type:   'private' as const,
    scheduled_at:  `${date}T${args.lessonTime}:00`,   // naive timestamptz — stored as local
    status:        'scheduled' as const,
    created_by:    user?.personId ?? null,
  }))

  const { data: lessons, error: lessonErr } = await supabase
    .from('lesson')
    .insert(lessonRows)
    .select('id, scheduled_at')

  if (lessonErr || !lessons) {
    // Best-effort cleanup: remove the subscription row we just created
    await supabase.from('lesson_subscription').delete().eq('id', sub.id)
    return { error: lessonErr?.message ?? 'Failed to create lessons.' }
  }

  // 3) Insert one lesson_rider per lesson tying rider → subscription
  const riderRows = lessons.map(l => ({
    lesson_id:       l.id,
    rider_id:        args.riderId,
    horse_id:        args.defaultHorseId,
    subscription_id: sub.id,
    package_id:      null,
  }))

  const { error: riderErr } = await supabase
    .from('lesson_rider')
    .insert(riderRows)

  if (riderErr) {
    // Clean up lessons + subscription
    await supabase.from('lesson').delete().in('id', lessons.map(l => l.id))
    await supabase.from('lesson_subscription').delete().eq('id', sub.id)
    return { error: riderErr.message }
  }

  revalidatePath('/chia/lessons-events')
  return { subscriptionId: sub.id }
}
