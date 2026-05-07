'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { DayOfWeek } from '@/lib/lessons/monthly/dates'
import { generateInitialMonths } from '@/lib/lessons/monthly/operations'
import { getPerLessonPrice, type SubscriptionType } from '@/lib/lessons/monthly/pricing'

/**
 * Create a new lesson subscription under the monthly model (ADR-0019).
 *
 * Flow:
 *   1. Auto-assign the rider role to the rider person (idempotent).
 *   2. Read the per-lesson rate for the chosen subscription_type from
 *      the catalog. Fail loudly if not set — admin must configure rates
 *      in Lessons & Events > Configuration > Catalog before creating
 *      monthly subscriptions.
 *   3. Insert lesson_subscription with status='active' (slot is held
 *      indefinitely; payment-gating happens at the lesson_month level
 *      now, not at subscription creation).
 *   4. Generate the 3-month rolling window (prorated current + 2 full
 *      future months) via the monthly library.
 *
 * Differences from the old quarterly action:
 *   - No quarter_id, no subscription_price, no startDate, no
 *     lessonDates array. The monthly model derives all of that from
 *     the slot + barn calendar at generation time.
 *   - subscription.status starts at 'active' instead of 'pending'.
 *     The Pending gate moves to lesson_month.status.
 */
export type CreateMonthlySubscriptionArgs = {
  riderId:           string
  billedToId:        string
  instructorId:      string
  dayOfWeek:         DayOfWeek
  lessonTime:        string         // "HH:MM"
  defaultHorseId:    string | null
  subscriptionType:  SubscriptionType
}

export type CreateMonthlySubscriptionResult = {
  error?:          string
  subscriptionId?: string
  /** Per-month preview shown back to admin after create — first month is prorated. */
  months?: Array<{
    year:        number
    month:       number
    lessonCount: number
    isProrated:  boolean
    total:       number
  }>
}

export async function createMonthlySubscription(
  args: CreateMonthlySubscriptionArgs,
): Promise<CreateMonthlySubscriptionResult> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  // 1. Look up the per-lesson rate. Fail early if admin hasn't set it.
  let perLessonPrice: number | null
  try {
    perLessonPrice = await getPerLessonPrice(supabase, args.subscriptionType)
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  if (perLessonPrice == null) {
    return {
      error:
        `Per-lesson rate for ${args.subscriptionType} riders is not set. ` +
        `Configure it in Lessons & Events → Configuration → Catalog before creating subscriptions.`,
    }
  }

  // 2. Auto-assign the rider role (idempotent — skips if already present;
  //    un-soft-deletes if it had been removed). Mirrors the legacy flow.
  const { data: existingRole } = await supabase
    .from('person_role')
    .select('id, deleted_at')
    .eq('person_id', args.riderId)
    .eq('role', 'rider')
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existingRole) {
    await supabase
      .from('person_role')
      .insert({ person_id: args.riderId, role: 'rider' })
  } else if (existingRole.deleted_at) {
    await supabase
      .from('person_role')
      .update({ deleted_at: null, assigned_at: new Date().toISOString() })
      .eq('id', existingRole.id)
  }

  // 3. Insert the slot subscription. Legacy quarterly columns (quarter_id,
  //    subscription_price, etc.) are left null — they're being dropped in
  //    PR 3b-rest along with the rest of the quarterly cruft.
  const { data: sub, error: subErr } = await supabase
    .from('lesson_subscription')
    .insert({
      rider_id:          args.riderId,
      billed_to_id:      args.billedToId,
      lesson_day:        args.dayOfWeek,
      lesson_time:       args.lessonTime,
      instructor_id:     args.instructorId,
      default_horse_id:  args.defaultHorseId,
      subscription_type: args.subscriptionType,
      status:            'active',
      created_by:        user?.personId ?? null,
    })
    .select('id')
    .single()

  if (subErr || !sub) {
    return { error: subErr?.message ?? 'Failed to create subscription.' }
  }

  // 4. Generate the 3-month rolling window. Cleanup: if generation fails
  //    we delete the subscription row we just created so admin can retry
  //    cleanly without an orphaned slot.
  let months
  try {
    const result = await generateInitialMonths({
      db:             supabase,
      subscriptionId: sub.id,
      perLessonPrice,
      createdBy:      user?.personId ?? null,
    })
    months = result.months
  } catch (e) {
    await supabase.from('lesson_subscription').delete().eq('id', sub.id)
    return { error: e instanceof Error ? e.message : String(e) }
  }

  revalidatePath('/chia/lessons-events')
  return {
    subscriptionId: sub.id,
    months: months.map((m) => ({
      year:        m.year,
      month:       m.month,
      lessonCount: m.lessonCount,
      isProrated:  m.isProrated,
      total:       perLessonPrice! * m.lessonCount,
    })),
  }
}
