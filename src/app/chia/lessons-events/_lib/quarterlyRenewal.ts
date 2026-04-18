// Quarterly Renewal — shared data helpers.
//
// The Quarterly Renewal tab in CHIA > Lessons & Events is a persistent view,
// not a wizard. It shows every active subscription in the current quarter and
// whether admin/rider has taken action on renewing it to the next quarter.
//
// Key rule: inaction = renewing. Rows default to Renewing unless explicitly
// flipped via the `renewal_intent` column on lesson_subscription.
//
// Terminology: internally we still call these "quarters" (the Quarter table
// name is settled), but the UI labels them by season (Summer / Fall / Winter /
// Spring) — that comes from Quarter.label directly (e.g. "Summer 2026").
//
// NOTE TO FUTURE BUILDER — rider-facing My Schedule view (not yet built):
// Pending LessonSubscription → pending Lesson records exist as soon as admin
// hits Create Pending, but they MUST NOT show up in the rider's My Schedule
// until the subscription invoice is paid and the webhook cascade flips them
// to 'scheduled'. When wiring that view, filter on `lesson.status = 'scheduled'`
// (exclude 'pending') and `lesson_subscription.status = 'active'`.

import type { DayOfWeek } from './generateLessonDates'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { displayName } from '@/lib/displayName'

type DB = SupabaseClient<Database>

export type QuarterRef = {
  id:         string
  label:      string
  start_date: string
  end_date:   string
  is_active:  boolean
}

export type RenewalPreviewRow = {
  // Source (current-quarter) subscription
  sourceSubscriptionId: string
  riderId:              string
  riderName:            string
  billedToId:           string
  billedToName:         string
  instructorId:         string
  instructorName:       string
  lessonDay:            DayOfWeek
  lessonTime:           string
  defaultHorseId:       string | null
  defaultHorseName:     string | null
  subscriptionType:     'standard' | 'boarder'
  subscriptionPrice:    number
  renewalIntent:        'renewing' | 'not_renewing'

  // Next-quarter state (if admin has already run Create Pending)
  alreadyPending:       boolean
  pendingSubscriptionId: string | null
  pendingInvoiceId:      string | null
  pendingInvoiceStatus:  'draft' | 'sent' | 'paid' | 'overdue' | null
}

export type RenewalSnapshot = {
  currentQuarter: QuarterRef | null
  nextQuarter:    QuarterRef | null
  rows:           RenewalPreviewRow[]
  // How many pending subs in next quarter don't yet have an invoice.
  // Drives the "Generate Invoices (N)" button on the Renewal page.
  pendingUninvoicedCount: number
  // Distinct billed-to recipients (name + email) for renewing rows. Used by
  // the "Renewal Recipients" copy-paste block — v1 plan is admin pastes
  // into Constant Contact (or similar) to send the renewal notice batch.
  // Rows without an email address are flagged so admin can chase them.
  renewalRecipients: Array<{ personId: string; name: string; email: string | null }>
}

/**
 * Load the renewal snapshot: current active quarter, the following quarter,
 * and one preview row per active subscription in the current quarter (with
 * any pre-existing next-quarter pending subscription attached).
 *
 * "Active quarter" = `quarter.is_active = true`. The partial unique index in
 * the schema enforces at most one. If none is set, we fall back to the quarter
 * whose date range contains today. If that also fails, currentQuarter is null
 * and the caller should show an empty state.
 *
 * "Next quarter" = earliest quarter with start_date > current.end_date.
 */
export async function loadRenewalSnapshot(db: DB): Promise<RenewalSnapshot> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: quarters } = await db
    .from('quarter')
    .select('id, label, mr_year, start_date, end_date, is_active')
    .is('deleted_at', null)
    .order('start_date')

  const allQuarters = (quarters ?? []) as QuarterRef[]

  let currentQuarter =
    allQuarters.find(q => q.is_active) ??
    allQuarters.find(q => q.start_date <= today && q.end_date >= today) ??
    null

  const nextQuarter = currentQuarter
    ? allQuarters.find(q => q.start_date > currentQuarter!.end_date) ?? null
    : null

  if (!currentQuarter) {
    return {
      currentQuarter: null, nextQuarter: null, rows: [],
      pendingUninvoicedCount: 0, renewalRecipients: [],
    }
  }

  // All subscriptions anchored to current quarter (pending or active). We
  // include pending too — a quarter may kick off with unpaid pending subs that
  // are still renewal candidates.
  const { data: currentSubs } = await db
    .from('lesson_subscription')
    .select(`
      id,
      lesson_day, lesson_time, subscription_price, subscription_type,
      renewal_intent, status, default_horse_id,
      rider:person!lesson_subscription_rider_id_fkey        ( id, first_name, last_name, preferred_name ),
      billed_to:person!lesson_subscription_billed_to_id_fkey ( id, first_name, last_name, preferred_name, email ),
      instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name ),
      horse:horse                                            ( id, barn_name )
    `)
    .eq('quarter_id', currentQuarter.id)
    .is('deleted_at', null)
    .in('status', ['pending', 'active'])

  // Existing pending subscriptions for the next quarter (if admin already ran
  // Create Pending). We match back to the source by (rider_id, lesson_day,
  // lesson_time, instructor_id) since there's no explicit parent pointer in
  // the schema — this is sufficient as long as a rider doesn't have two
  // identical slots.
  const nextQuarterPending = nextQuarter
    ? (await db
        .from('lesson_subscription')
        .select('id, rider_id, lesson_day, lesson_time, instructor_id, invoice_id, status, invoice:invoice(id, status)')
        .eq('quarter_id', nextQuarter.id)
        .is('deleted_at', null)).data ?? []
    : []

  const pendingIndex = new Map<string, typeof nextQuarterPending[number]>()
  for (const p of nextQuarterPending) {
    const key = `${p.rider_id}|${p.lesson_day}|${p.lesson_time}|${p.instructor_id}`
    pendingIndex.set(key, p)
  }

  const rows: RenewalPreviewRow[] = []
  for (const s of currentSubs ?? []) {
    const rider      = s.rider
    const billedTo   = s.billed_to
    const instructor = s.instructor
    if (!rider || !billedTo || !instructor) continue

    const key = `${rider.id}|${s.lesson_day}|${s.lesson_time}|${instructor.id}`
    const pending = pendingIndex.get(key)
    const pendingInvoice = pending?.invoice as
      | { id: string; status: 'draft' | 'sent' | 'paid' | 'overdue' }
      | null
      | undefined

    rows.push({
      sourceSubscriptionId: s.id,
      riderId:              rider.id,
      riderName:            displayName(rider),
      billedToId:           billedTo.id,
      billedToName:         displayName(billedTo),
      instructorId:         instructor.id,
      instructorName:       displayName(instructor),
      lessonDay:            s.lesson_day as DayOfWeek,
      lessonTime:           s.lesson_time,
      defaultHorseId:       s.default_horse_id,
      defaultHorseName:     s.horse?.barn_name ?? null,
      subscriptionType:     s.subscription_type,
      subscriptionPrice:    Number(s.subscription_price),
      renewalIntent:        s.renewal_intent,
      alreadyPending:       !!pending,
      pendingSubscriptionId: pending?.id ?? null,
      pendingInvoiceId:      pendingInvoice?.id ?? null,
      pendingInvoiceStatus:  pendingInvoice?.status ?? null,
    })
  }

  // Sort: renewing first, then by instructor → day → time for a stable grid.
  const DAY_ORDER: DayOfWeek[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]
  rows.sort((a, b) => {
    if (a.renewalIntent !== b.renewalIntent) return a.renewalIntent === 'renewing' ? -1 : 1
    if (a.instructorName !== b.instructorName) return a.instructorName.localeCompare(b.instructorName)
    const da = DAY_ORDER.indexOf(a.lessonDay)
    const db_ = DAY_ORDER.indexOf(b.lessonDay)
    if (da !== db_) return da - db_
    return a.lessonTime.localeCompare(b.lessonTime)
  })

  const pendingUninvoicedCount = nextQuarterPending.filter(p => p.status === 'pending' && !p.invoice_id).length

  // Build the distinct renewal-recipient list (billed-to person for every
  // renewing row, de-duped). Kept on the snapshot so the Renewal page can
  // render a copy-to-clipboard block — v1 email batch runs outside CHIA.
  const recipientMap = new Map<string, { personId: string; name: string; email: string | null }>()
  for (const s of currentSubs ?? []) {
    if (s.renewal_intent !== 'renewing' || !s.billed_to) continue
    const personId = s.billed_to.id
    if (recipientMap.has(personId)) continue
    recipientMap.set(personId, {
      personId,
      name:  displayName(s.billed_to),
      email: (s.billed_to as { email?: string | null }).email ?? null,
    })
  }
  const renewalRecipients = Array.from(recipientMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  return { currentQuarter, nextQuarter, rows, pendingUninvoicedCount, renewalRecipients }
}
