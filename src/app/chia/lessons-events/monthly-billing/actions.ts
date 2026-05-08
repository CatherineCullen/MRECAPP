'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { endSubscription } from '@/lib/lessons/monthly/operations'
import { createAndSendInvoice, type LineItemInput } from '@/lib/payments/nmi/invoice'
import { lineItemDescription } from '@/lib/lessons/monthly/lineItem'
import { displayName } from '@/lib/displayName'
import { monthEndIso, monthStartIso } from '@/lib/lessons/monthly/dates'
import { type DuePolicy, dueDateForPolicy } from '@/lib/billing/dueDate'

/**
 * Per-bundle due-date policy for monthly billing batches:
 *   - If any subscription in this bundle has NO prior invoiced
 *     lesson_month, treat the whole bundle as first-month → due upon
 *     receipt (rider hasn't established a recurring relationship).
 *   - Otherwise the bundle is renewing → due 1st of the billed month.
 *
 * One due_date per chia invoice, so a bundle that mixes new + renewing
 * slots picks the more conservative (sooner) date.
 */
async function loadSubscriptionsWithPriorInvoices(
  supabase: ReturnType<typeof createAdminClient>,
  subscriptionIds: string[],
): Promise<Set<string>> {
  if (subscriptionIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('lesson_month')
    .select('subscription_id')
    .in('subscription_id', subscriptionIds)
    .not('invoice_id', 'is', null)
    .is('deleted_at', null)
  if (error) throw new Error(`Failed to compute first-month set: ${error.message}`)
  return new Set((data ?? []).map((r) => r.subscription_id))
}

/**
 * Server actions for the Monthly Subscriptions tab (ADR-0019).
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

/**
 * Edit a pending lesson_month's per-lesson price. Refused for Invoiced
 * or Paid rows — once the invoice is sent, the price lives on
 * invoice_line_item.unit_price too, and silently diverging them is a
 * bug surface. Admin can void the invoice (returns rows to Pending)
 * if they need to correct after the fact.
 */
export async function updateLessonMonthPrice(
  args: { lessonMonthId: string; perLessonPrice: number },
): Promise<{ ok: true; newTotal: number } | { ok: false; error: string }> {
  if (!Number.isFinite(args.perLessonPrice) || args.perLessonPrice < 0) {
    return { ok: false, error: 'Price must be a non-negative number.' }
  }

  const supabase = createAdminClient()

  const { data: lm, error: readErr } = await supabase
    .from('lesson_month')
    .select('id, status, lesson_count')
    .eq('id', args.lessonMonthId)
    .is('deleted_at', null)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!lm)     return { ok: false, error: 'Lesson month not found.' }
  if (lm.status !== 'Pending') {
    return { ok: false, error: `Cannot edit price on ${lm.status} months. Void the invoice first.` }
  }

  const newTotal = Number(args.perLessonPrice) * Number(lm.lesson_count)
  const { error: updErr } = await supabase
    .from('lesson_month')
    .update({ per_lesson_price: args.perLessonPrice, total: newTotal })
    .eq('id', args.lessonMonthId)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath('/chia/lessons-events/monthly-billing')
  return { ok: true, newTotal }
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

  // Determine which subscriptions have already been invoiced before so
  // we can pick "upon receipt" for first-month bundles vs "1st of the
  // billed month" for renewing ones.
  const subsWithPrior = await loadSubscriptionsWithPriorInvoices(
    supabase,
    rows.map((r) => r.lesson_subscription.id),
  )

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

    const isFirstMonthBundle = bundle.rows.some(
      (r) => !subsWithPrior.has(r.lesson_subscription.id),
    )
    const duePolicy: DuePolicy = isFirstMonthBundle
      ? { kind: 'upon_receipt' }
      : { kind: 'firstOfMonth', year: args.year, month: args.month }

    try {
      const sent = await createAndSendInvoice({
        personId:  bundle.billedToId,
        lineItems,
        duePolicy,
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
  revalidatePath('/my', 'layout')

  const totalSent    = results.filter((r) => r.success).length
  const totalErrored = results.length - totalSent

  return { results, totalSent, totalErrored }
}

// ============================================================================
// exportMonthInvoices — CSV export at "Send All" time (the second leg of the fork)
// ============================================================================

export type ExportMonthInvoicesArgs = {
  year:  number
  month: number
}

export type ExportMonthInvoicesResult = {
  /** CSV body, ready for the client to download. UTF-8, RFC 4180-style escaping. */
  csv:           string
  /** Suggested filename (admin sees this in the browser save dialog). */
  filename:      string
  /** Per-invoice outcomes — rows in the export. */
  invoiceCount:  number
  lessonMonthCount: number
  totalAmount:   number
}

/**
 * CSV Export at Send All time. The second leg of the fork from
 * ADR-0021: admin chooses Export instead of NMI when they'd rather
 * bill externally and settle via manual mark-paid (PR 9a).
 *
 * Generates a CSV with one row per LessonMonth (so a two-slot rider
 * shows as two rows, both grouped under the same chia_invoice_id).
 * Columns: chia_invoice_id, billed_to_name, billed_to_email, rider,
 * slot, instructor, lesson_count, dates, per_lesson_price, total,
 * description_for_paste (the canonical NMI line format from
 * `lineItem.ts`, ready to drop into whatever external tool admin uses).
 *
 * Server-side effects per recipient:
 *   - Creates a chia `invoice` row (status='sent', `exported_at` stamped).
 *   - Inserts one `invoice_line_item` per LessonMonth.
 *   - Flips lesson_months → status='Invoiced' + stamps invoice_id.
 *
 * Manual mark-paid (PR 9a) handles settlement when admin processes
 * payment externally.
 *
 * No outbound side effects — admin is taking the data outside CHIA.
 * Kill switch doesn't apply.
 */
export async function exportMonthInvoices(
  args: ExportMonthInvoicesArgs,
): Promise<ExportMonthInvoicesResult> {
  const supabase = createAdminClient()

  // Same loading shape as sendMonthInvoices.
  const { data: months, error: loadErr } = await supabase
    .from('lesson_month')
    .select(`
      id, year, month, lesson_count, per_lesson_price, total, status,
      lesson_subscription!inner (
        id, lesson_day, lesson_time, billed_to_id, ended_at,
        rider:person!lesson_subscription_rider_id_fkey (
          id, first_name, last_name, preferred_name, is_organization, organization_name
        ),
        instructor:person!lesson_subscription_instructor_id_fkey (
          id, first_name, last_name, preferred_name, is_organization, organization_name
        ),
        billed_to:person!lesson_subscription_billed_to_id_fkey (
          id, first_name, last_name, preferred_name, is_organization, organization_name, email
        )
      )
    `)
    .eq('year', args.year)
    .eq('month', args.month)
    .eq('status', 'Pending')
    .is('deleted_at', null)

  if (loadErr) throw new Error(`Failed to load pending lesson_months: ${loadErr.message}`)

  type Row = NonNullable<typeof months>[number]
  const rows: Row[] = (months ?? []).filter((m) => !m.lesson_subscription?.ended_at)

  if (rows.length === 0) {
    return {
      csv:              csvHeader() + '\n',
      filename:         `chia-export-${args.year}-${String(args.month).padStart(2, '0')}.csv`,
      invoiceCount:     0,
      lessonMonthCount: 0,
      totalAmount:      0,
    }
  }

  // Pull the per-month lesson dates (same as sendMonthInvoices).
  const monthIds = rows.map((r) => r.id)
  const { data: lessons, error: lessonsErr } = await supabase
    .from('lesson')
    .select('id, scheduled_at, month_id')
    .in('month_id', monthIds)
    .is('deleted_at', null)
    .order('scheduled_at')

  if (lessonsErr) {
    throw new Error(`Failed to load lessons for export: ${lessonsErr.message}`)
  }

  const datesByMonthId = new Map<string, string[]>()
  for (const l of lessons ?? []) {
    if (!l.month_id) continue
    const date = (l.scheduled_at ?? '').slice(0, 10)
    if (!date) continue
    const list = datesByMonthId.get(l.month_id) ?? []
    list.push(date)
    datesByMonthId.set(l.month_id, list)
  }

  // Group by billed_to person (one chia invoice per bundle, same as
  // sendMonthInvoices).
  type Bundle = {
    billedToId:     string
    billedToName:   string
    billedToEmail:  string | null
    rows:           Row[]
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
        billedToName:  displayName(sub.billed_to),
        billedToEmail: sub.billed_to?.email ?? null,
        rows:          [r],
      })
    }
  }

  const period = {
    start: monthStartIso(args.year, args.month),
    end:   monthEndIso(args.year, args.month),
  }

  // Determine first-month-ness once for the whole batch.
  const subsWithPriorExport = await loadSubscriptionsWithPriorInvoices(
    supabase,
    rows.map((r) => r.lesson_subscription.id),
  )

  const csvLines: string[] = [csvHeader()]
  let totalAmount = 0

  // For each bundle: create the chia invoice + line items, stamp
  // exported_at, flip lesson_months. Then emit CSV rows.
  for (const bundle of bundles.values()) {
    const sentAtIso = new Date().toISOString()

    const isFirstMonthBundle = bundle.rows.some(
      (r) => !subsWithPriorExport.has(r.lesson_subscription.id),
    )
    const due = dueDateForPolicy(
      isFirstMonthBundle
        ? { kind: 'upon_receipt' }
        : { kind: 'firstOfMonth', year: args.year, month: args.month },
    )

    // Create the chia invoice row directly — no createAndSendInvoice
    // helper since no NMI call is being made. exported_at stamps the
    // row as having gone via the export path.
    const { data: invoice, error: invErr } = await supabase
      .from('invoice')
      .insert({
        billed_to_id: bundle.billedToId,
        period_start: period.start,
        period_end:   period.end,
        status:       'sent',
        sent_at:      sentAtIso,
        due_date:     due.chiaDueDate,
        exported_at:  sentAtIso,
        notes:        `Lessons — ${period.start} to ${period.end} (exported)`,
      })
      .select('id')
      .single()

    if (invErr || !invoice) {
      throw new Error(`Failed to create export invoice for ${bundle.billedToName}: ${invErr?.message ?? 'unknown'}`)
    }

    // Build line items per LessonMonth.
    const lineItems = bundle.rows.map((r) => {
      const sub   = r.lesson_subscription
      const dates = (datesByMonthId.get(r.id) ?? []).sort()
      const description = lineItemDescription({
        dayOfWeek:      sub.lesson_day,
        lessonTime:     sub.lesson_time,
        instructorName: displayName(sub.instructor),
        dates,
        perLessonPrice: Number(r.per_lesson_price),
      })
      const total = Number(r.total ?? r.per_lesson_price * r.lesson_count)
      // No `lesson_month_id` on invoice_line_item yet — the schema's
      // existing source-FK columns predate the monthly-model rewrite.
      // We track the linkage via lesson_month.invoice_id (the inverse
      // direction) which the upcoming UPDATE stamps. The
      // lesson_subscription_id source FK gives us enough provenance
      // for invoice detail rendering and reports.
      return {
        invoice_id:        invoice.id,
        description,
        quantity:          1,
        unit_price:        total,
        is_credit:         false,
        line_item_type:    'standard' as const,
        lesson_subscription_id: sub.id,
      }
    })

    const { error: linesErr } = await supabase
      .from('invoice_line_item')
      .insert(lineItems)
    if (linesErr) {
      throw new Error(`Failed to insert line items for ${bundle.billedToName}: ${linesErr.message}`)
    }

    // Flip lesson_months → Invoiced + stamp invoice_id.
    const { error: monthUpdateErr } = await supabase
      .from('lesson_month')
      .update({ status: 'Invoiced', invoice_id: invoice.id })
      .in('id', bundle.rows.map((r) => r.id))
    if (monthUpdateErr) {
      throw new Error(`Failed to update lesson_months for ${bundle.billedToName}: ${monthUpdateErr.message}`)
    }

    // Emit CSV rows — one per LessonMonth in this bundle.
    for (const r of bundle.rows) {
      const sub   = r.lesson_subscription
      const dates = (datesByMonthId.get(r.id) ?? []).sort()
      const total = Number(r.total ?? r.per_lesson_price * r.lesson_count)
      totalAmount += total
      const description = lineItemDescription({
        dayOfWeek:      sub.lesson_day,
        lessonTime:     sub.lesson_time,
        instructorName: displayName(sub.instructor),
        dates,
        perLessonPrice: Number(r.per_lesson_price),
      })
      csvLines.push(toCsvRow([
        invoice.id,
        bundle.billedToName,
        bundle.billedToEmail ?? '',
        displayName(sub.rider),
        `${capitalize(sub.lesson_day)} ${sub.lesson_time.slice(0, 5)}`,
        displayName(sub.instructor),
        String(r.lesson_count),
        dates.join(' '),
        Number(r.per_lesson_price).toFixed(2),
        total.toFixed(2),
        description,
      ]))
    }
  }

  revalidatePath('/chia/lessons-events/monthly-billing')
  revalidatePath('/chia/lessons-events')
  revalidatePath('/my', 'layout')

  const filename = `chia-export-${args.year}-${String(args.month).padStart(2, '0')}.csv`
  return {
    csv:              csvLines.join('\n') + '\n',
    filename,
    invoiceCount:     bundles.size,
    lessonMonthCount: rows.length,
    totalAmount,
  }
}

/** Single source of truth for the export CSV column order. */
function csvHeader(): string {
  return toCsvRow([
    'chia_invoice_id',
    'billed_to_name',
    'billed_to_email',
    'rider',
    'slot',
    'instructor',
    'lesson_count',
    'dates',
    'per_lesson_price',
    'total',
    'description_for_paste',
  ])
}

/** RFC 4180-style CSV row — escape any cell containing comma, quote, or newline. */
function toCsvRow(cells: string[]): string {
  return cells.map(escapeCsv).join(',')
}

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
