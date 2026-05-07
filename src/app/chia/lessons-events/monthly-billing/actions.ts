'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { endSubscription } from '@/lib/lessons/monthly/operations'
import { createAndSendInvoice, type LineItemInput } from '@/lib/payments/nmi/invoice'
import { lineItemDescription } from '@/lib/lessons/monthly/lineItem'
import { displayName } from '@/lib/displayName'
import { monthEndIso, monthStartIso } from '@/lib/lessons/monthly/dates'

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

// ============================================================================
// sendMonthInvoices — NMI batch send for a target month
// ============================================================================

export type SendMonthInvoicesArgs = {
  year:  number
  /** 1-12 */
  month: number
}

export type SendMonthInvoicesResult = {
  /** Per-recipient outcomes. One entry per billed-to-person we tried to invoice. */
  results: Array<{
    billedToId:   string
    billedToName: string
    /** Number of LessonMonth rows bundled into this invoice. */
    lessonMonthCount: number
    /** Total invoice amount (sum of all bundled LessonMonths). */
    total:        number
    success:      boolean
    /** Set when success=true. */
    nmiInvoiceId?: string
    /** Set when success=false. */
    error?:        string
  }>
  totalSent:    number
  totalErrored: number
}

/**
 * Batch-send NMI invoices for every Pending lesson_month in the target
 * year/month. Groups by billed-to person, so a rider with two slots
 * (two subscriptions, two LessonMonths) gets one invoice with two line
 * items — per ADR-0019.
 *
 * Send-or-skip is per-recipient: a failure on one recipient doesn't
 * block the others. Result aggregates outcomes so admin can see what
 * sent and what didn't.
 *
 * Status flow per LessonMonth:
 *   Pending -> Invoiced (with `invoice_id` set to the chia invoice row)
 *
 * Outbound kill switch: every NMI call goes through `assertNmiOutboundAllowed`
 * which throws unless `OUTBOUND_ENABLED=true`. In dev that means the
 * action will return per-recipient errors with the kill-switch message
 * — admin sets the env var when ready to send for real.
 */
export async function sendMonthInvoices(
  args: SendMonthInvoicesArgs,
): Promise<SendMonthInvoicesResult> {
  const supabase = createAdminClient()

  // 1. Fetch all Pending lesson_months for the target year/month, with
  //    their subscription details for line-item construction.
  const { data: months, error: loadErr } = await supabase
    .from('lesson_month')
    .select(`
      id, year, month, lesson_count, per_lesson_price, total, status,
      lesson_subscription!inner (
        id, lesson_day, lesson_time, billed_to_id, ended_at,
        instructor:person!lesson_subscription_instructor_id_fkey (
          id, first_name, last_name, preferred_name, is_organization, organization_name
        ),
        billed_to:person!lesson_subscription_billed_to_id_fkey (
          id, first_name, last_name, preferred_name, is_organization, organization_name
        )
      )
    `)
    .eq('year', args.year)
    .eq('month', args.month)
    .eq('status', 'Pending')
    .is('deleted_at', null)

  if (loadErr) {
    throw new Error(`Failed to load pending lesson_months: ${loadErr.message}`)
  }

  type Row = NonNullable<typeof months>[number]
  const rows: Row[] = (months ?? []).filter((m) => !m.lesson_subscription?.ended_at)

  if (rows.length === 0) {
    return { results: [], totalSent: 0, totalErrored: 0 }
  }

  // 2. For each row, fetch the lesson dates that belong to it (so the
  //    line-item description can carry "(4/5, 4/12, 4/19, 4/26)"). We
  //    pull dates in one batched query keyed by month_id, then group.
  const monthIds = rows.map((r) => r.id)
  const { data: lessons, error: lessonsErr } = await supabase
    .from('lesson')
    .select('id, scheduled_at, month_id')
    .in('month_id', monthIds)
    .is('deleted_at', null)
    .order('scheduled_at')

  if (lessonsErr) {
    throw new Error(`Failed to load lessons for invoice generation: ${lessonsErr.message}`)
  }

  const datesByMonthId = new Map<string, string[]>()
  // scheduled_at is a timestamptz / timestamp; we want the calendar
  // date in the barn's local view. Stripping the time-of-day to YYYY-MM-DD
  // matches the format the lineItemDescription helper expects.
  for (const l of (lessons ?? [])) {
    if (!l.month_id) continue
    const date = (l.scheduled_at ?? '').slice(0, 10)
    if (!date) continue
    const list = datesByMonthId.get(l.month_id) ?? []
    list.push(date)
    datesByMonthId.set(l.month_id, list)
  }

  // 3. Group rows by billed_to person.
  type Bundle = {
    billedToId:   string
    billedToName: string
    rows:         Row[]
  }
  const bundles = new Map<string, Bundle>()
  for (const r of rows) {
    const sub = r.lesson_subscription
    const billedToId = sub.billed_to_id
    const existing = bundles.get(billedToId)
    if (existing) {
      existing.rows.push(r)
    } else {
      bundles.set(billedToId, {
        billedToId,
        billedToName: displayName(sub.billed_to),
        rows: [r],
      })
    }
  }

  const period = {
    start: monthStartIso(args.year, args.month),
    end:   monthEndIso(args.year, args.month),
  }

  // 4. Send each bundle. Per-recipient try/catch so one failure doesn't
  //    abort the rest.
  const results: SendMonthInvoicesResult['results'] = []
  for (const bundle of bundles.values()) {
    const lineItems: LineItemInput[] = bundle.rows.map((r) => {
      const sub   = r.lesson_subscription
      const dates = (datesByMonthId.get(r.id) ?? []).sort()
      const description = lineItemDescription({
        dayOfWeek:      sub.lesson_day,
        lessonTime:     sub.lesson_time,
        instructorName: displayName(sub.instructor),
        dates,
        perLessonPrice: Number(r.per_lesson_price),
      })
      // We bill the row's pre-computed total as a single line. quantity=1
      // keeps NMI's totals math straightforward; the description above
      // already shows the rate × count breakdown for the rider.
      return {
        description,
        unitPrice:            Number(r.total ?? r.per_lesson_price * r.lesson_count),
        quantity:             1,
        lessonSubscriptionId: sub.id,
        lessonMonthId:        r.id,
      }
    })

    const total = lineItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0)

    try {
      const sent = await createAndSendInvoice({
        personId:  bundle.billedToId,
        lineItems,
      })

      // Stamp the chia_invoice_id on every LessonMonth in this bundle
      // and flip status to Invoiced. Also stamp the period bounds so
      // the row exits the "to send" queue.
      const monthIds = bundle.rows.map((r) => r.id)
      await supabase
        .from('lesson_month')
        .update({
          status:     'Invoiced',
          invoice_id: sent.chiaInvoiceId,
        })
        .in('id', monthIds)

      // Also stamp the invoice row's billing-period bounds so the
      // unbilled queues / reports can scope by month.
      await supabase
        .from('invoice')
        .update({
          period_start: period.start,
          period_end:   period.end,
        })
        .eq('id', sent.chiaInvoiceId)

      results.push({
        billedToId:       bundle.billedToId,
        billedToName:     bundle.billedToName,
        lessonMonthCount: bundle.rows.length,
        total,
        success:          true,
        nmiInvoiceId:     sent.nmiInvoiceId,
      })
    } catch (e) {
      results.push({
        billedToId:       bundle.billedToId,
        billedToName:     bundle.billedToName,
        lessonMonthCount: bundle.rows.length,
        total,
        success:          false,
        error:            e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidatePath('/chia/lessons-events/monthly-billing')
  revalidatePath('/chia/lessons-events')

  const totalSent    = results.filter((r) => r.success).length
  const totalErrored = results.length - totalSent

  return { results, totalSent, totalErrored }
}
