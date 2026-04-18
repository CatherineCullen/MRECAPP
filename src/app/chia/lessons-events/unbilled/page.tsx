import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UnbilledPackagesList, { type UnbilledGroup, type UnbilledItem, type SkippedItem } from './_components/UnbilledPackagesList'
import { loadLessonSent } from '../invoices/_lib/loadLessonInvoices'
import LessonSentView from '../invoices/_components/LessonSentView'
import { displayName } from '@/lib/displayName'

/**
 * Unbilled Products — unbilled lesson products AND unbilled events, grouped
 * by billed-to person. Admin clicks "Send invoice" on a group → every unbilled
 * item that person owes bundles into a single Stripe invoice. Backing call is
 * `createInvoiceForUnbilled` which handles both lesson_package and event
 * source rows.
 *
 * Also surfaces "skipped" items (billing_skipped_at set) in a collapsible
 * footer section with an Un-skip action. This is a stop-gap home for skipped
 * rows until the per-person profile page exists — at that point, skipped
 * packages/events for a rider should live on their profile alongside their
 * invoiced and pending items. (TODO: move to `/chia/people/:id` when profile
 * page is built; then this page can go back to just "what needs billing now".)
 */
export default async function BillingProductsPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const db = createAdminClient()

  // Find current active quarter so we can scope pending-subscription billing
  // to "mid-quarter signups." Renewal handles next-quarter pending subs; this
  // page handles everything else unbilled.
  const today = new Date().toISOString().slice(0, 10)
  const { data: allQuarters } = await db
    .from('quarter')
    .select('id, start_date, end_date, is_active')
    .is('deleted_at', null)
    .order('start_date')
  const currentQuarter =
    (allQuarters ?? []).find(q => q.is_active) ??
    (allQuarters ?? []).find(q => q.start_date <= today && q.end_date >= today) ??
    null

  const [
    { data: packages,        error: pkgErr },
    { data: events,          error: evtErr },
    { data: pendingSubs,     error: subErr },
    { data: skippedPackages, error: skipPkgErr },
    { data: skippedEvents,   error: skipEvtErr },
    sent,
  ] = await Promise.all([
    db
      .from('lesson_package')
      .select(`
        id, product_type, package_size, package_price, purchased_at, notes,
        billed_to:person!lesson_package_billed_to_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name, stripe_customer_id ),
        rider:person!lesson_package_person_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .is('invoice_id', null)
      .is('billing_skipped_at', null)
      .is('deleted_at', null)
      .order('purchased_at', { ascending: true }),
    db
      .from('event')
      .select(`
        id, title, price, scheduled_at, notes,
        type:event_type ( code, label, calendar_color, calendar_badge ),
        host:person!event_host_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name, stripe_customer_id )
      `)
      .is('invoice_id', null)
      .is('billing_skipped_at', null)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true }),
    // Pending current-quarter subscriptions (mid-quarter signups awaiting
    // their first invoice). Next-quarter pending subs are the renewal batch
    // and live under the Renewal tab, so they're filtered out here.
    currentQuarter
      ? db
          .from('lesson_subscription')
          .select(`
            id, lesson_day, lesson_time, subscription_price,
            is_prorated, prorated_price,
            billed_to:person!lesson_subscription_billed_to_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name, stripe_customer_id ),
            rider:person!lesson_subscription_rider_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
            instructor:person!lesson_subscription_instructor_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
            quarter:quarter ( id, label )
          `)
          .eq('quarter_id', currentQuarter.id)
          .eq('status', 'pending')
          .is('invoice_id', null)
          .is('deleted_at', null)
          .order('lesson_day', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    db
      .from('lesson_package')
      .select(`
        id, product_type, package_size, package_price, purchased_at,
        billing_skipped_at, billing_skipped_reason,
        billed_to:person!lesson_package_billed_to_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
        rider:person!lesson_package_person_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .not('billing_skipped_at', 'is', null)
      .is('deleted_at', null)
      .order('billing_skipped_at', { ascending: false }),
    db
      .from('event')
      .select(`
        id, title, price, scheduled_at,
        billing_skipped_at, billing_skipped_reason,
        type:event_type ( code, label, calendar_color, calendar_badge ),
        host:person!event_host_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .not('billing_skipped_at', 'is', null)
      .is('deleted_at', null)
      .order('billing_skipped_at', { ascending: false }),
    loadLessonSent('current'),
  ])

  if (pkgErr)     throw pkgErr
  if (evtErr)     throw evtErr
  if (subErr)     throw subErr
  if (skipPkgErr) throw skipPkgErr
  if (skipEvtErr) throw skipEvtErr

  type BilledTo = {
    id: string
    first_name: string | null
    last_name: string | null
    preferred_name: string | null
    is_organization: boolean | null
    organization_name: string | null
    stripe_customer_id: string | null
  }

  const groupMap = new Map<string, UnbilledGroup>()

  function ensureGroup(billedTo: BilledTo): UnbilledGroup {
    let g = groupMap.get(billedTo.id)
    if (!g) {
      g = {
        billedToId:        billedTo.id,
        billedToName:      displayName(billedTo),
        hasStripeCustomer: Boolean(billedTo.stripe_customer_id),
        items:             [],
        total:             0,
      }
      groupMap.set(billedTo.id, g)
    }
    return g
  }

  // Packages
  for (const p of packages ?? []) {
    const billedTo = p.billed_to as BilledTo | null
    if (!billedTo) continue
    const g = ensureGroup(billedTo)
    const rider = p.rider as {
      first_name: string | null
      last_name: string | null
      preferred_name: string | null
      is_organization: boolean | null
      organization_name: string | null
    } | null
    const item: UnbilledItem = {
      kind:         'package',
      id:           p.id,
      title:        `${p.product_type}${p.package_size > 1 ? ` ×${p.package_size}` : ''}`,
      subtitle:     rider ? displayName(rider) : '—',
      price:        Number(p.package_price),
      dateLabel:    `Purchased ${new Date(p.purchased_at + 'T00:00:00').toLocaleDateString()}`,
      notes:        p.notes,
      badgeText:    null,
      badgeColor:   null,
    }
    g.items.push(item)
    g.total += item.price
  }

  // Subscriptions (mid-quarter signups, pending, no invoice yet)
  function formatTime(t: string): string {
    const [h, m] = t.split(':').map(Number)
    const h12 = h % 12 || 12
    const ampm = h < 12 ? 'AM' : 'PM'
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }
  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  for (const s of pendingSubs ?? []) {
    const billedTo = s.billed_to as BilledTo | null
    if (!billedTo) continue
    const g = ensureGroup(billedTo)
    const rider = s.rider as {
      first_name: string | null
      last_name: string | null
      preferred_name: string | null
      is_organization: boolean | null
      organization_name: string | null
    } | null
    const instructor = s.instructor as typeof rider
    const price = s.is_prorated && s.prorated_price != null
      ? Number(s.prorated_price)
      : Number(s.subscription_price)
    const slot = `${capitalize(s.lesson_day)} ${formatTime(s.lesson_time)}`
    const qLabel = (s.quarter as { label?: string } | null)?.label ?? 'Quarter'
    const riderLabel = rider ? displayName(rider) : '—'
    const instructorLabel = instructor ? displayName(instructor) : '—'
    const item: UnbilledItem = {
      kind:         'subscription',
      id:           s.id,
      title:        `${qLabel} Subscription${s.is_prorated ? ' · Prorated' : ''}`,
      subtitle:     `${riderLabel} — ${slot} with ${instructorLabel}`,
      price,
      dateLabel:    'Mid-quarter signup',
      notes:        null,
      badgeText:    null,
      badgeColor:   null,
    }
    g.items.push(item)
    g.total += price
  }

  // Events
  for (const e of events ?? []) {
    const host = e.host as BilledTo | null
    if (!host) continue
    const g = ensureGroup(host)
    const evtType = e.type as { label?: string; calendar_color?: string | null; calendar_badge?: string | null } | null
    const item: UnbilledItem = {
      kind:         'event',
      id:           e.id,
      title:        evtType?.label ?? 'Event',
      subtitle:     e.title,
      price:        Number(e.price),
      dateLabel:    `Scheduled ${new Date(e.scheduled_at).toLocaleDateString()}`,
      notes:        e.notes,
      badgeText:    evtType?.calendar_badge ?? null,
      badgeColor:   evtType?.calendar_color ?? null,
    }
    g.items.push(item)
    g.total += item.price
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.billedToName.localeCompare(b.billedToName)
  )
  const totalItems = (packages?.length ?? 0) + (events?.length ?? 0) + (pendingSubs?.length ?? 0)

  // Skipped rows — flat chronological list. Kept simple; these are out of the
  // billing flow but we want them discoverable + reversible.
  const skipped: SkippedItem[] = []

  for (const p of skippedPackages ?? []) {
    const billedTo = p.billed_to as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null } | null
    if (!billedTo) continue
    const rider = p.rider as { first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null } | null
    skipped.push({
      kind:          'package',
      id:            p.id,
      billedToId:    billedTo.id,
      billedToName:  displayName(billedTo),
      title:         `${p.product_type}${p.package_size > 1 ? ` ×${p.package_size}` : ''}`,
      subtitle:      rider ? displayName(rider) : '—',
      price:         Number(p.package_price),
      dateLabel:     `Purchased ${new Date(p.purchased_at + 'T00:00:00').toLocaleDateString()}`,
      skippedAt:     p.billing_skipped_at!,
      skippedReason: p.billing_skipped_reason,
      badgeText:     null,
      badgeColor:    null,
    })
  }

  for (const e of skippedEvents ?? []) {
    const host = e.host as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null } | null
    if (!host) continue
    const evtType = e.type as { label?: string; calendar_color?: string | null; calendar_badge?: string | null } | null
    skipped.push({
      kind:          'event',
      id:            e.id,
      billedToId:    host.id,
      billedToName:  displayName(host),
      title:         evtType?.label ?? 'Event',
      subtitle:      e.title,
      price:         Number(e.price),
      dateLabel:     `Scheduled ${new Date(e.scheduled_at).toLocaleDateString()}`,
      skippedAt:     e.billing_skipped_at!,
      skippedReason: e.billing_skipped_reason,
      badgeText:     evtType?.calendar_badge ?? null,
      badgeColor:    evtType?.calendar_color ?? null,
    })
  }

  // Sort skipped newest-first so the most recent "oh I just skipped that"
  // un-skip is at the top.
  skipped.sort((a, b) => b.skippedAt.localeCompare(a.skippedAt))

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#191c1e]">Invoices</h2>
          <div className="text-xs text-[#444650] mt-0.5">
            Current-quarter one-off billing: extra lessons, events, and mid-quarter
            subscription signups. Renewal-batch invoices live under the Renewal tab.
          </div>
        </div>
        {groups.length > 0 && (
          <div className="text-xs text-[#444650] tabular-nums">
            {groups.length} {groups.length === 1 ? 'person' : 'people'} ·{' '}
            {totalItems} products · $
            {groups.reduce((s, g) => s + g.total, 0).toFixed(2)}
          </div>
        )}
      </div>

      {groups.length === 0 && skipped.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center text-sm text-[#8c8e98]">
          Nothing to bill right now. Extra lessons, events, and new subscriptions appear here when created.
        </div>
      ) : (
        <UnbilledPackagesList groups={groups} skipped={skipped} />
      )}

      {/* Sent one-off invoices for the current quarter. Kept underneath the
          unbilled queue so admin can see the full current-quarter billing
          story in one place — what's queued up, what's gone out. */}
      {sent.groups.length > 0 && (
        <div className="mt-8 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-[#ecedf2]">
            <h3 className="text-sm font-semibold text-[#191c1e]">Sent This Quarter</h3>
            <p className="text-xs text-[#444650] mt-0.5">
              One-off subscription invoices that have already been sent. Extra-lesson /
              event invoices show on Stripe directly.
            </p>
          </div>
          <LessonSentView snapshot={sent} />
        </div>
      )}
    </div>
  )
}
