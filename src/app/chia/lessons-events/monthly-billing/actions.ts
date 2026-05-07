'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { endSubscription } from '@/lib/lessons/monthly/operations'

/**
 * Server actions for the Monthly Billing tab (ADR-0019).
 */

export type MarkNotContinuingResult = {
  error?:              string
  removedMonthsCount?: number
  removedLessonsCount?: number
}

/**
 * Admin action: mark a slot subscription as retired. Wraps the
 * `endSubscription` library function — sets `ended_at`, soft-deletes
 * pending lesson_months and their lesson rows from today forward.
 *
 * Doesn't touch already-Invoiced or already-Paid months. Doesn't
 * change subscription.status (that gets the 'Inactive' enum value
 * in PR 3b-rest's schema cleanup; for now `ended_at IS NOT NULL`
 * is the canonical retirement signal).
 */
export async function markNotContinuing(
  subscriptionId: string,
): Promise<MarkNotContinuingResult> {
  const supabase = createAdminClient()
  try {
    const result = await endSubscription({ db: supabase, subscriptionId })
    revalidatePath('/chia/lessons-events/monthly-billing')
    revalidatePath('/chia/lessons-events')
    return {
      removedMonthsCount:  result.removedMonthsCount,
      removedLessonsCount: result.removedLessonsCount,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to mark not continuing.' }
  }
}
