import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UnbilledPackagesList, { type UnbilledGroup, type UnbilledItem, type SkippedItem } from './_components/UnbilledPackagesList'
import { loadLessonSent } from '../invoices/_lib/loadLessonInvoices'
import LessonSentView from '../invoices/_components/LessonSentView'
import { displayName } from '@/lib/displayName'
import { BARN_TZ } from '@/lib/datetime'

/**
 * Unbilled Products — unbilled lesson products (extras, evaluations) and
 * unbilled events, grouped by billed-to person. Admin clicks "Send invoice"
 * on a group → every unbilled item that person owes bundles into a single
 * invoice via NMI (or CSV Export at Send All).
 *
 * Subscription billing lives on the Monthly Billing tab — under the
 * monthly model (ADR-0019) recurring weekly slots are billed per
 * lesson_month, not as a single quarterly subscription invoice. This page
 * is now strictly one-off products and events.
 *
 * Skipped items (billing_skipped_at set) live in a collapsible footer
 * section with an Un-skip action. Stop-gap until per-person profile pages
 * exist (TODO: move to /chia/people/:id).
 */
export default async function BillingProductsPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const db = createAdminClient()

  const [
    { data: packages,        error: pkgErr },
    { data: events,          error: evtErr },
    { data: skippedPackages, error: skipPkgErr },
    { data: skippedEvents,   error: skipEvtErr },
    sent,
  ] = await Promise.all([
    db
      .from('lesson_package')
      .select(`
        id, product_type, package_size, package_price, purchased_at, notes,
        billed_to:person!lesson_package_billed_to_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
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
        host:person!event_host_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name )
      `)
      .is('invoice_id', null)
      .is('billing_skipped_at', null)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true }),
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
    loadLessonSent(),
  ])

  if (pkgErr)     throw pkgErr
  if (evtErr)     throw evtErr
  if (skipPkgErr) throw skipPkgErr
  if (skipEvtErr) throw skipEvtErr

  type BilledTo = {
    id: string
    first_name: string | null
    last_name: string | null
    preferred_name: string | null
    is_organization: boolean | null
    organization_name: string | null
  }

  const groupMap = new Map<string, UnbilledGroup>()

  function ensureGroup(billedTo: BilledTo): UnbilledGroup {
    let g = groupMap.get(billedTo.id)
    if (!g) {
      g = {
        billedToId:        billedTo.id,
        billedToName:      displayName(billedTo),
        hasStripeCustomer: false,
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
      dateLabel:    `Scheduled ${new Date(e.scheduled_at).toLocaleDateString('en-US', { timeZone: BARN_TZ })}`,
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
  const totalItems = (packages?.length ?? 0) + (events?.length ?? 0)

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
      dateLabel:     `Scheduled ${new Date(e.scheduled_at).toLocaleDateString('en-US', { timeZone: BARN_TZ })}`,
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
            One-off lesson products and events queued for billing. Recurring monthly
            slot billing lives on the Monthly Billing tab.
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
          Nothing to bill right now. Extra lessons and events appear here when created.
        </div>
      ) : (
        <UnbilledPackagesList groups={groups} skipped={skipped} />
      )}

      {/* Sent one-off lesson invoices, grouped by sent month so admin can
          see what's gone out recently alongside what's queued. */}
      {sent.groups.length > 0 && (
        <div className="mt-8 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-[#ecedf2]">
            <h3 className="text-sm font-semibold text-[#191c1e]">Sent</h3>
            <p className="text-xs text-[#444650] mt-0.5">
              One-off lesson invoices already sent, grouped by month.
            </p>
          </div>
          <LessonSentView snapshot={sent} />
        </div>
      )}
    </div>
  )
}
