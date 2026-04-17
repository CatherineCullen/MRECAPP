import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAndSendInvoice, type LineItemInput } from './invoice'

/**
 * Unified "send invoice for all unbilled stuff this person owes" builder.
 *
 * Takes a set of unbilled lesson_package ids AND/OR event ids for a single
 * billed-to Person, builds one Stripe invoice with one line item per source,
 * and backfills invoice_id on both tables so nothing stays "unbilled."
 *
 * Why unified: packages and events both surface on the same Unbilled Products
 * page, both get billed to the same Person (host for events = billed-to for
 * packages), and the barn workflow is "send one invoice for everything John
 * owes this month" — splitting them into two separate Stripe invoices would
 * double the emails for no reason.
 *
 * Guardrails:
 *  - All sources must belong to the same billed-to Person. Enforced here
 *    (packages.billed_to_id, event.host_id).
 *  - Every source must currently be unbilled (invoice_id IS NULL). Already-
 *    billed sources are refused to prevent double-billing.
 *  - If the post-send backfill fails, we throw loudly. The Stripe invoice is
 *    already out; admin must manually reconcile. Matches packageInvoice.ts
 *    posture — Stripe is authoritative once sent.
 */
export async function createInvoiceForUnbilled(params: {
  billedToId: string
  packageIds: string[]
  eventIds: string[]
}): Promise<{
  stripeInvoiceId: string
  hostedInvoiceUrl: string | null
  chiaInvoiceId: string
  packageCount: number
  eventCount: number
}> {
  const { billedToId, packageIds, eventIds } = params

  if (packageIds.length === 0 && eventIds.length === 0) {
    throw new Error('No products selected to invoice')
  }

  const db = createAdminClient()

  // ---------- Packages ------------------------------------------------------
  let packages: Array<{
    id: string
    billed_to_id: string
    product_type: string
    package_size: number
    package_price: number
    invoice_id: string | null
    default_horse_id: string | null
    person_id: string
  }> = []

  if (packageIds.length > 0) {
    const { data, error } = await db
      .from('lesson_package')
      .select(
        'id, billed_to_id, product_type, package_size, package_price, invoice_id, default_horse_id, person_id'
      )
      .in('id', packageIds)
      .is('deleted_at', null)

    if (error) throw new Error(`Failed to load packages: ${error.message}`)
    if (!data || data.length !== packageIds.length) {
      throw new Error(
        `Expected ${packageIds.length} packages, loaded ${data?.length ?? 0} — some were deleted or don't exist`
      )
    }
    const wrongPerson = data.find((p) => p.billed_to_id !== billedToId)
    if (wrongPerson) {
      throw new Error(
        `Package ${wrongPerson.id} belongs to a different billed-to person; refusing to bundle across people`
      )
    }
    const alreadyBilled = data.filter((p) => p.invoice_id)
    if (alreadyBilled.length > 0) {
      throw new Error(
        `Refusing to re-bill package(s) already attached to an invoice: ${alreadyBilled.map((p) => p.id).join(', ')}`
      )
    }
    packages = data
  }

  // ---------- Events --------------------------------------------------------
  let events: Array<{
    id: string
    host_id: string
    title: string
    price: number
    invoice_id: string | null
    event_type_code: string
    typeLabel: string
  }> = []

  if (eventIds.length > 0) {
    const { data, error } = await db
      .from('event')
      .select(
        'id, host_id, title, price, invoice_id, event_type_code, type:event_type ( label )'
      )
      .in('id', eventIds)
      .is('deleted_at', null)

    if (error) throw new Error(`Failed to load events: ${error.message}`)
    if (!data || data.length !== eventIds.length) {
      throw new Error(
        `Expected ${eventIds.length} events, loaded ${data?.length ?? 0} — some were deleted or don't exist`
      )
    }
    const wrongHost = data.find((e) => e.host_id !== billedToId)
    if (wrongHost) {
      throw new Error(
        `Event ${wrongHost.id} belongs to a different host; refusing to bundle across people`
      )
    }
    const alreadyBilled = data.filter((e) => e.invoice_id)
    if (alreadyBilled.length > 0) {
      throw new Error(
        `Refusing to re-bill event(s) already attached to an invoice: ${alreadyBilled.map((e) => e.id).join(', ')}`
      )
    }
    events = data.map((e) => ({
      id: e.id,
      host_id: e.host_id,
      title: e.title,
      price: Number(e.price),
      invoice_id: e.invoice_id,
      event_type_code: e.event_type_code,
      typeLabel: (e.type as { label?: string } | null)?.label ?? e.event_type_code,
    }))
  }

  // ---------- Rider names (packages) ---------------------------------------
  const riderIds = Array.from(new Set(packages.map((p) => p.person_id)))
  let riderById = new Map<string, {
    id: string
    first_name: string | null
    last_name: string | null
    preferred_name: string | null
    is_organization: boolean | null
    organization_name: string | null
  }>()
  if (riderIds.length > 0) {
    const { data: riders } = await db
      .from('person')
      .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
      .in('id', riderIds)
    riderById = new Map((riders ?? []).map((r) => [r.id, r]))
  }

  // ---------- Line items ---------------------------------------------------
  const packageLines: LineItemInput[] = packages.map((p) => {
    const rider = riderById.get(p.person_id)
    const riderLabel = rider
      ? rider.is_organization
        ? (rider.organization_name ?? 'Organization')
        : [rider.first_name, rider.last_name].filter(Boolean).join(' ')
      : 'Rider'
    const sizeSuffix = p.package_size && p.package_size > 1 ? ` ×${p.package_size}` : ''
    return {
      description: `${p.product_type}${sizeSuffix} — ${riderLabel}`,
      unitPrice: Number(p.package_price),
      quantity: 1,
      lessonPackageId: p.id,
      horseId: p.default_horse_id ?? undefined,
    }
  })

  const eventLines: LineItemInput[] = events.map((e) => ({
    description: `${e.typeLabel} — ${e.title}`,
    unitPrice: e.price,
    quantity: 1,
    eventId: e.id,
  }))

  const lineItems = [...packageLines, ...eventLines]

  const descParts: string[] = []
  if (packages.length > 0) descParts.push(`${packages.length} lesson product${packages.length === 1 ? '' : 's'}`)
  if (events.length > 0)   descParts.push(`${events.length} event${events.length === 1 ? '' : 's'}`)

  const result = await createAndSendInvoice({
    personId: billedToId,
    lineItems,
    notes: descParts.join(' + '),
  })

  // ---------- Backfill invoice_id on source rows ----------------------------
  if (packages.length > 0) {
    const { error: pkgErr } = await db
      .from('lesson_package')
      .update({ invoice_id: result.chiaInvoiceId })
      .in('id', packages.map((p) => p.id))
    if (pkgErr) {
      throw new Error(
        `Invoice sent (Stripe: ${result.stripeInvoiceId}) but failed to backfill lesson_package.invoice_id: ${pkgErr.message}. Manual reconciliation required.`
      )
    }
  }

  if (events.length > 0) {
    const { error: evtErr } = await db
      .from('event')
      .update({ invoice_id: result.chiaInvoiceId })
      .in('id', events.map((e) => e.id))
    if (evtErr) {
      throw new Error(
        `Invoice sent (Stripe: ${result.stripeInvoiceId}) but failed to backfill event.invoice_id: ${evtErr.message}. Manual reconciliation required.`
      )
    }
  }

  return {
    ...result,
    packageCount: packages.length,
    eventCount: events.length,
  }
}
