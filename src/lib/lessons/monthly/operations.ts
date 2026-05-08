import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { barnLocalToUtcIso } from '@/lib/datetime'
import {
  type CalendarDay,
  type DayOfWeek,
  addMonths,
  monthEndIso,
  monthOfIso,
  monthStartIso,
  slotDatesInMonth,
  todayIso,
} from './dates'

/**
 * Server-side operations for the monthly lesson model (ADR-0019).
 *
 * Builds on `dates.ts` (pure date math) by adding the DB writes that
 * generate `lesson_month` + `lesson` + `lesson_rider` rows for a slot
 * subscription. Library code only — UI surfaces (Monthly Subscriptions tab,
 * subscription create form) live in route folders and call into these
 * functions.
 *
 * Status-field convention during the rewrite:
 *   - lesson_month.status starts at 'Pending' (replaces the old
 *     subscription-level Pending gate). Flips to Invoiced/Paid via the
 *     batch flow + webhook cascade.
 *   - lesson.status starts at 'pending'. Flips to 'scheduled' when the
 *     parent lesson_month is paid (webhook cascade in PR 8).
 *   - lesson_subscription.status STAYS 'active' throughout — we don't
 *     write Inactive yet because the enum doesn't have that value until
 *     PR 3b-rest's schema cleanup. Instead we use `ended_at IS NOT NULL`
 *     as the "this slot is retired" signal; new monthly queries should
 *     filter on it. Old quarterly code that only checks status='active'
 *     will include retired subs as a temporary correctness drift, which
 *     is acceptable since that code is being deleted in 3b-rest.
 */

type DB = SupabaseClient<Database>

// ============================================================================
// generateLessonMonth — one month, soup to nuts
// ============================================================================

export type GenerateLessonMonthArgs = {
  db:                DB
  subscriptionId:    string
  year:              number
  /** 1-12 */
  month:             number
  /** Snapshotted onto the lesson_month row. */
  perLessonPrice:    number
  /**
   * True when this is the current month at signup (mid-month), generating
   * only remaining slot dates from `fromDate` forward. Recorded on the
   * lesson_month row for downstream visibility — admin can tell at a
   * glance which months were prorated.
   */
  isProrated:        boolean
  /**
   * ISO 'YYYY-MM-DD'. When set, only dates >= this generate lessons.
   * Required for `isProrated = true`; ignored for full-month generation.
   */
  fromDate?:         string
  /** Person id (admin) creating the rows; flows through to created_by. */
  createdBy?:        string | null
}

export type GenerateLessonMonthResult = {
  lessonMonthId: string
  lessonCount:   number
  dates:         string[]
}

/**
 * Insert a `lesson_month` row plus the `lesson` and `lesson_rider` rows
 * that belong to it. Atomic-on-failure: if any step fails, prior inserts
 * for this month are rolled back via best-effort cleanup.
 *
 * Throws if the subscription doesn't exist, or if the calendar table has
 * no entries for the target month (per the existing convention — calendar
 * is the source of truth, missing dates = no lessons generated).
 */
export async function generateLessonMonth(args: GenerateLessonMonthArgs): Promise<GenerateLessonMonthResult> {
  const { db, subscriptionId, year, month, perLessonPrice, isProrated, createdBy } = args

  // 1. Read subscription details we need to populate lesson + lesson_rider rows.
  const { data: sub, error: subErr } = await db
    .from('lesson_subscription')
    .select('id, rider_id, lesson_day, lesson_time, instructor_id, default_horse_id')
    .eq('id', subscriptionId)
    .single()

  if (subErr || !sub) {
    throw new Error(`Subscription ${subscriptionId} not found: ${subErr?.message ?? 'no rows'}`)
  }

  // 2. Pull calendar days for the month — date + barn_closed are all we need.
  //    We deliberately don't filter on is_makeup_day even though the column
  //    still exists — ADR-0019 dropped the makeup-window concept.
  const { data: calendarDays, error: calErr } = await db
    .from('barn_calendar_day')
    .select('date, barn_closed')
    .gte('date', monthStartIso(year, month))
    .lte('date', monthEndIso(year, month))

  if (calErr) {
    throw new Error(`Failed to load calendar for ${year}-${month}: ${calErr.message}`)
  }
  if (!calendarDays || calendarDays.length === 0) {
    throw new Error(
      `No barn_calendar_day rows for ${year}-${String(month).padStart(2, '0')}. ` +
        `Calendar must be seeded before generating lessons.`,
    )
  }

  // 3. Compute the slot dates this month, applying proration if requested.
  const dates = slotDatesInMonth({
    dayOfWeek:    sub.lesson_day as DayOfWeek,
    year,
    month,
    calendarDays: calendarDays as CalendarDay[],
    fromDate:     isProrated ? args.fromDate : undefined,
  })

  // Empty months are valid (e.g. closure-heavy months). Insert the
  // lesson_month row with lesson_count=0 — admin sees it as $0 and can
  // delete or invoice as a $0 confirmation depending on policy.
  // 4. Insert the lesson_month row.
  const { data: lessonMonth, error: lmErr } = await db
    .from('lesson_month')
    .insert({
      subscription_id:  subscriptionId,
      year,
      month,
      lesson_count:     dates.length,
      per_lesson_price: perLessonPrice,
      status:           'Pending',
      is_prorated:      isProrated,
    })
    .select('id')
    .single()

  if (lmErr || !lessonMonth) {
    throw new Error(`Failed to insert lesson_month: ${lmErr?.message ?? 'unknown'}`)
  }

  // 5. Insert lesson rows. Lesson status starts at 'pending' — flips to
  //    'scheduled' when the parent lesson_month is paid via the webhook
  //    cascade (PR 8). lesson.month_id ties them to the parent.
  if (dates.length > 0) {
    const lessonRows = dates.map((date) => ({
      instructor_id: sub.instructor_id,
      lesson_type:   'private' as const,
      scheduled_at:  barnLocalToUtcIso(date, sub.lesson_time),
      status:        'pending' as const,
      month_id:      lessonMonth.id,
      created_by:    createdBy ?? null,
    }))

    const { data: lessons, error: lessonErr } = await db
      .from('lesson')
      .insert(lessonRows)
      .select('id')

    if (lessonErr || !lessons) {
      // Best-effort rollback — remove the lesson_month we just created.
      await db.from('lesson_month').delete().eq('id', lessonMonth.id)
      throw new Error(`Failed to insert lessons: ${lessonErr?.message ?? 'unknown'}`)
    }

    // 6. Insert one lesson_rider per lesson — links rider, horse, and
    //    subscription to each lesson in the group lesson model.
    const riderRows = lessons.map((l) => ({
      lesson_id:       l.id,
      rider_id:        sub.rider_id,
      horse_id:        sub.default_horse_id,
      subscription_id: sub.id,
      package_id:      null,
    }))

    const { error: riderErr } = await db.from('lesson_rider').insert(riderRows)

    if (riderErr) {
      // Best-effort rollback — remove lessons and the lesson_month.
      await db.from('lesson').delete().in('id', lessons.map((l) => l.id))
      await db.from('lesson_month').delete().eq('id', lessonMonth.id)
      throw new Error(`Failed to insert lesson_rider rows: ${riderErr.message}`)
    }
  }

  return {
    lessonMonthId: lessonMonth.id,
    lessonCount:   dates.length,
    dates,
  }
}

// ============================================================================
// generateInitialMonths — at signup, build the 3-month rolling window
// ============================================================================

export type GenerateInitialMonthsArgs = {
  db:             DB
  subscriptionId: string
  /** ISO date — defaults to today. Used as the "current" month and proration cutoff. */
  asOf?:          string
  /**
   * Snapshotted onto every lesson_month created. Caller is responsible for
   * pulling the right rate from the catalog (Standard vs Boarder).
   */
  perLessonPrice: number
  createdBy?:     string | null
}

export type GenerateInitialMonthsResult = {
  months: Array<{
    year:          number
    month:         number
    lessonMonthId: string
    lessonCount:   number
    isProrated:    boolean
  }>
}

/**
 * At subscription signup: generate prorated current month + 2 full
 * future months. This is the new-rider onboarding path that's also the
 * primary migration path (per session log 2026-05-07 — every existing
 * rider gets re-onboarded as their old quarter ends).
 */
export async function generateInitialMonths(args: GenerateInitialMonthsArgs): Promise<GenerateInitialMonthsResult> {
  const { db, subscriptionId, perLessonPrice, createdBy } = args
  const asOf = args.asOf ?? todayIso()
  const { year, month } = monthOfIso(asOf)

  const out: GenerateInitialMonthsResult['months'] = []

  // Current month — prorated from `asOf` forward.
  const current = await generateLessonMonth({
    db,
    subscriptionId,
    year,
    month,
    perLessonPrice,
    isProrated: true,
    fromDate:   asOf,
    createdBy,
  })
  out.push({ year, month, lessonMonthId: current.lessonMonthId, lessonCount: current.lessonCount, isProrated: true })

  // Next two months — full count, not prorated.
  for (let i = 1; i <= 2; i++) {
    const next = addMonths(year, month, i)
    const result = await generateLessonMonth({
      db,
      subscriptionId,
      year:           next.year,
      month:          next.month,
      perLessonPrice,
      isProrated:     false,
      createdBy,
    })
    out.push({
      year:          next.year,
      month:         next.month,
      lessonMonthId: result.lessonMonthId,
      lessonCount:   result.lessonCount,
      isProrated:    false,
    })
  }

  return { months: out }
}

// ============================================================================
// extendRollingWindow — at batch send, push the leading edge forward by 1
// ============================================================================

export type ExtendRollingWindowArgs = {
  db:             DB
  subscriptionId: string
  perLessonPrice: number
  createdBy?:     string | null
}

export type ExtendRollingWindowResult = {
  year:          number
  month:         number
  lessonMonthId: string
  lessonCount:   number
} | null

/**
 * Generate one new lesson_month at the leading edge of the rolling
 * window. Called per-Active-subscription at monthly batch send time so
 * the always-3-months-ahead view stays consistent.
 *
 * Returns null if the subscription has been ended (ended_at set) — we
 * don't extend retired slots forward.
 */
export async function extendRollingWindow(args: ExtendRollingWindowArgs): Promise<ExtendRollingWindowResult> {
  const { db, subscriptionId, perLessonPrice, createdBy } = args

  // Skip if the subscription has been ended.
  const { data: sub, error: subErr } = await db
    .from('lesson_subscription')
    .select('id, ended_at')
    .eq('id', subscriptionId)
    .single()
  if (subErr || !sub) {
    throw new Error(`Subscription ${subscriptionId} not found: ${subErr?.message ?? 'no rows'}`)
  }
  if (sub.ended_at) return null

  // Find the latest existing lesson_month for this subscription. We sort
  // on (year DESC, month DESC) and take the first.
  const { data: latest, error: latestErr } = await db
    .from('lesson_month')
    .select('year, month')
    .eq('subscription_id', subscriptionId)
    .is('deleted_at', null)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) {
    throw new Error(`Failed to find latest lesson_month: ${latestErr.message}`)
  }
  if (!latest) {
    throw new Error(
      `Subscription ${subscriptionId} has no existing lesson_month rows — ` +
        `extendRollingWindow can't run without a starting point. Did signup-time generation succeed?`,
    )
  }

  const next = addMonths(latest.year, latest.month, 1)
  const result = await generateLessonMonth({
    db,
    subscriptionId,
    year:           next.year,
    month:          next.month,
    perLessonPrice,
    isProrated:     false,
    createdBy,
  })

  return {
    year:          next.year,
    month:         next.month,
    lessonMonthId: result.lessonMonthId,
    lessonCount:   result.lessonCount,
  }
}

// ============================================================================
// endSubscription — admin marks the slot retired
// ============================================================================

export type EndSubscriptionArgs = {
  db:             DB
  subscriptionId: string
  /** ISO date — defaults to today. Pending lesson_months starting after this date get soft-deleted. */
  asOf?:          string
}

export type EndSubscriptionResult = {
  removedMonthsCount:  number
  removedLessonsCount: number
}

/**
 * Mark a subscription as retired: stamp `ended_at`, soft-delete any
 * Pending lesson_month rows (and their lesson rows) starting after the
 * cutoff. Doesn't touch already-Invoiced or already-Paid months.
 *
 * For the current month: if it's still Pending, this will soft-delete it
 * too. If admin has already invoiced + the rider already paid, the
 * current month stays — admin uses the existing barn-cancel flow with
 * grantTokens=false to handle remaining lessons in that month
 * separately.
 *
 * Doesn't change `lesson_subscription.status` because the enum doesn't
 * have an 'Inactive' value yet (added in PR 3b-rest's schema cleanup).
 * `ended_at IS NOT NULL` is the canonical "retired" signal until then.
 */
export async function endSubscription(args: EndSubscriptionArgs): Promise<EndSubscriptionResult> {
  const { db, subscriptionId } = args
  const asOf = args.asOf ?? todayIso()
  const { year: cutoffYear, month: cutoffMonth } = monthOfIso(asOf)

  // 1. Stamp ended_at on the subscription (if not already set — preserves
  //    the original retirement date if admin clicks the button twice).
  const { data: sub, error: subErr } = await db
    .from('lesson_subscription')
    .select('id, ended_at')
    .eq('id', subscriptionId)
    .single()
  if (subErr || !sub) {
    throw new Error(`Subscription ${subscriptionId} not found: ${subErr?.message ?? 'no rows'}`)
  }

  if (!sub.ended_at) {
    const { error: stampErr } = await db
      .from('lesson_subscription')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', subscriptionId)
    if (stampErr) {
      throw new Error(`Failed to stamp ended_at: ${stampErr.message}`)
    }
  }

  // 2. Find Pending lesson_month rows at or after the cutoff month.
  //    "After cutoff" includes the current month — this clears in-flight
  //    pending billing for the rider as they leave.
  const { data: pendingMonths, error: pmErr } = await db
    .from('lesson_month')
    .select('id, year, month')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'Pending')
    .is('deleted_at', null)

  if (pmErr) {
    throw new Error(`Failed to load pending lesson_months: ${pmErr.message}`)
  }

  const toRemove = (pendingMonths ?? []).filter(
    (m) => m.year > cutoffYear || (m.year === cutoffYear && m.month >= cutoffMonth),
  )

  if (toRemove.length === 0) {
    return { removedMonthsCount: 0, removedLessonsCount: 0 }
  }

  const monthIds = toRemove.map((m) => m.id)
  const nowIso = new Date().toISOString()

  // 3. Soft-delete the lesson rows for those months.
  const { data: removedLessons, error: lessonDelErr } = await db
    .from('lesson')
    .update({ deleted_at: nowIso })
    .in('month_id', monthIds)
    .is('deleted_at', null)
    .select('id')

  if (lessonDelErr) {
    throw new Error(`Failed to soft-delete lessons: ${lessonDelErr.message}`)
  }

  // 4. Soft-delete the lesson_month rows themselves.
  const { error: monthDelErr } = await db
    .from('lesson_month')
    .update({ deleted_at: nowIso })
    .in('id', monthIds)

  if (monthDelErr) {
    throw new Error(`Failed to soft-delete lesson_months: ${monthDelErr.message}`)
  }

  return {
    removedMonthsCount:  toRemove.length,
    removedLessonsCount: removedLessons?.length ?? 0,
  }
}
