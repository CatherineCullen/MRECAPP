'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createInvoiceForUnbilled } from '@/lib/payments/nmi/unbilledInvoice'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

/**
 * Bundle a person's unbilled lesson packages AND events into ONE NMI
 * invoice. Admin-only. All packageIds must belong to the same billedToId
 * (billed_to_id), and all eventIds must have the same host_id. The
 * Unbilled Products UI already groups them by person so that is invariant
 * by the time we get here.
 *
 * Recurring monthly slot billing goes through the Monthly Subscriptions tab,
 * not this path.
 */
export async function sendPackageInvoice(params: {
  billedToId: string
  packageIds: string[]
  eventIds?:  string[]
}): Promise<{
  nmiInvoiceId?:      string
  chiaInvoiceId?:     string
  packageCount?:      number
  eventCount?:        number
  subscriptionCount?: number
  error?:             string
}> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  try {
    const result = await createInvoiceForUnbilled({
      billedToId: params.billedToId,
      packageIds: params.packageIds,
      eventIds:   params.eventIds ?? [],
    })
    revalidatePath('/chia/lessons-events/unbilled')
    revalidatePath(`/chia/people/${params.billedToId}`)
    revalidatePath('/chia/lessons-events')
    // Recipient's /my surfaces (Invoices tab, Schedule) need to see the new invoice.
    revalidatePath('/my', 'layout')
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

// ============================================================================
// exportPackageInvoice — CSV export fork for one-off lesson invoicing.
// Mirrors exportMonthInvoices on the Monthly Subscriptions tab. Same fork
// shape (NMI vs Export at "Send invoice" time), same downstream model:
// chia invoice row gets stamped exported_at, source rows get linked,
// admin settles via Mark Paid once external billing clears.
// ============================================================================

export type ExportPackageInvoiceResult = {
  csv:           string
  filename:      string
  chiaInvoiceId: string
  packageCount:  number
  eventCount:    number
  totalAmount:   number
}

export async function exportPackageInvoice(params: {
  billedToId: string
  packageIds: string[]
  eventIds?:  string[]
}): Promise<{ data?: ExportPackageInvoiceResult; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  const billedToId = params.billedToId
  const packageIds = params.packageIds
  const eventIds   = params.eventIds ?? []

  if (packageIds.length === 0 && eventIds.length === 0) {
    return { error: 'No products selected to invoice' }
  }

  const db = createAdminClient()

  try {
    // Load + validate billed-to person.
    const { data: billedTo, error: btErr } = await db
      .from('person')
      .select('id, first_name, last_name, preferred_name, is_organization, organization_name, email')
      .eq('id', billedToId)
      .maybeSingle()
    if (btErr || !billedTo) {
      throw new Error(`Failed to load billed-to person: ${btErr?.message ?? 'not found'}`)
    }

    // Load + validate packages.
    let packages: Array<{
      id: string
      person_id: string
      product_type: string
      package_size: number
      package_price: number
      default_horse_id: string | null
    }> = []
    if (packageIds.length > 0) {
      const { data, error } = await db
        .from('lesson_package')
        .select('id, billed_to_id, person_id, product_type, package_size, package_price, invoice_id, default_horse_id')
        .in('id', packageIds)
        .is('deleted_at', null)
      if (error) throw new Error(`Failed to load packages: ${error.message}`)
      if (!data || data.length !== packageIds.length) {
        throw new Error(
          `Expected ${packageIds.length} packages, loaded ${data?.length ?? 0} — some were deleted or don't exist`,
        )
      }
      const wrong = data.find((p) => p.billed_to_id !== billedToId)
      if (wrong) throw new Error(`Package ${wrong.id} belongs to a different billed-to person`)
      const already = data.filter((p) => p.invoice_id)
      if (already.length > 0) {
        throw new Error(`Refusing to re-bill package(s) already attached to an invoice: ${already.map((p) => p.id).join(', ')}`)
      }
      packages = data.map((p) => ({
        id:               p.id,
        person_id:        p.person_id,
        product_type:     p.product_type,
        package_size:     p.package_size,
        package_price:    Number(p.package_price),
        default_horse_id: p.default_horse_id,
      }))
    }

    // Load + validate events.
    let events: Array<{
      id: string
      title: string
      price: number
      scheduled_at: string
      typeLabel: string
    }> = []
    if (eventIds.length > 0) {
      const { data, error } = await db
        .from('event')
        .select('id, host_id, title, price, scheduled_at, invoice_id, event_type_code, type:event_type ( label )')
        .in('id', eventIds)
        .is('deleted_at', null)
      if (error) throw new Error(`Failed to load events: ${error.message}`)
      if (!data || data.length !== eventIds.length) {
        throw new Error(
          `Expected ${eventIds.length} events, loaded ${data?.length ?? 0} — some were deleted or don't exist`,
        )
      }
      const wrong = data.find((e) => e.host_id !== billedToId)
      if (wrong) throw new Error(`Event ${wrong.id} belongs to a different host`)
      const already = data.filter((e) => e.invoice_id)
      if (already.length > 0) {
        throw new Error(`Refusing to re-bill event(s) already attached to an invoice: ${already.map((e) => e.id).join(', ')}`)
      }
      events = data.map((e) => ({
        id:           e.id,
        title:        e.title,
        price:        Number(e.price),
        scheduled_at: e.scheduled_at,
        typeLabel:    (e.type as { label?: string } | null)?.label ?? e.event_type_code,
      }))
    }

    // Rider names for package line items.
    const riderIds = Array.from(new Set(packages.map((p) => p.person_id)))
    const riderById = new Map<string, { first_name: string | null; last_name: string | null; preferred_name: string | null; is_organization: boolean | null; organization_name: string | null }>()
    if (riderIds.length > 0) {
      const { data: riders } = await db
        .from('person')
        .select('id, first_name, last_name, preferred_name, is_organization, organization_name')
        .in('id', riderIds)
      for (const r of riders ?? []) riderById.set(r.id, r)
    }

    // Create the chia invoice (status='sent', exported_at stamped — no NMI).
    // One-off products are always due upon receipt — there's no recurring
    // anchor to defer payment to.
    const sentAtIso = new Date().toISOString()
    const dueIso = sentAtIso.slice(0, 10)
    const { data: invoice, error: invErr } = await db
      .from('invoice')
      .insert({
        billed_to_id: billedToId,
        status:       'sent',
        sent_at:      sentAtIso,
        due_date:     dueIso,
        exported_at:  sentAtIso,
        notes:        `One-off products (exported)`,
        created_by:   user.personId ?? null,
      })
      .select('id')
      .single()
    if (invErr || !invoice) {
      throw new Error(`Failed to create export invoice: ${invErr?.message ?? 'unknown'}`)
    }

    // Build CSV rows + invoice line items.
    const csvLines: string[] = [csvHeader()]
    let totalAmount = 0

    type LineRow = {
      invoice_id:        string
      description:       string
      quantity:          number
      unit_price:        number
      is_credit:         boolean
      line_item_type:    'standard'
      lesson_package_id: string | null
      event_id:          string | null
      horse_id:          string | null
    }
    const lineItems: LineRow[] = []

    for (const p of packages) {
      const rider = riderById.get(p.person_id) ?? null
      const riderLabel = rider ? displayName(rider) : 'Rider'
      const sizeSuffix = p.package_size > 1 ? ` ×${p.package_size}` : ''
      const description = `${p.product_type}${sizeSuffix} — ${riderLabel}`
      const total = p.package_price
      totalAmount += total
      lineItems.push({
        invoice_id:        invoice.id,
        description,
        quantity:          1,
        unit_price:        total,
        is_credit:         false,
        line_item_type:    'standard',
        lesson_package_id: p.id,
        event_id:          null,
        horse_id:          p.default_horse_id,
      })
      csvLines.push(toCsvRow([
        invoice.id,
        displayName(billedTo),
        billedTo.email ?? '',
        'package',
        description,
        '',
        total.toFixed(2),
        description,
      ]))
    }

    for (const e of events) {
      const description = `${e.typeLabel} — ${e.title}`
      const total = e.price
      totalAmount += total
      lineItems.push({
        invoice_id:        invoice.id,
        description,
        quantity:          1,
        unit_price:        total,
        is_credit:         false,
        line_item_type:    'standard',
        lesson_package_id: null,
        event_id:          e.id,
        horse_id:          null,
      })
      csvLines.push(toCsvRow([
        invoice.id,
        displayName(billedTo),
        billedTo.email ?? '',
        'event',
        description,
        e.scheduled_at.slice(0, 10),
        total.toFixed(2),
        description,
      ]))
    }

    const { error: linesErr } = await db.from('invoice_line_item').insert(lineItems)
    if (linesErr) throw new Error(`Failed to insert line items: ${linesErr.message}`)

    // Backfill source rows so they leave the unbilled queue.
    if (packages.length > 0) {
      const { error } = await db
        .from('lesson_package')
        .update({ invoice_id: invoice.id })
        .in('id', packages.map((p) => p.id))
      if (error) throw new Error(`Package backfill failed: ${error.message}. Manual reconciliation required.`)
    }
    if (events.length > 0) {
      const { error } = await db
        .from('event')
        .update({ invoice_id: invoice.id })
        .in('id', events.map((e) => e.id))
      if (error) throw new Error(`Event backfill failed: ${error.message}. Manual reconciliation required.`)
    }

    revalidatePath('/chia/lessons-events/unbilled')
    revalidatePath(`/chia/people/${billedToId}`)
    revalidatePath('/chia/lessons-events')
    revalidatePath('/my', 'layout')

    const filename = `chia-export-${displayName(billedTo).replace(/\s+/g, '-')}-${sentAtIso.slice(0, 10)}.csv`
    return {
      data: {
        csv:           csvLines.join('\n') + '\n',
        filename,
        chiaInvoiceId: invoice.id,
        packageCount:  packages.length,
        eventCount:    events.length,
        totalAmount,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function csvHeader(): string {
  return toCsvRow([
    'chia_invoice_id',
    'billed_to_name',
    'billed_to_email',
    'source_kind',
    'description',
    'date',
    'total',
    'description_for_paste',
  ])
}

function toCsvRow(cells: string[]): string {
  return cells.map(escapeCsv).join(',')
}

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Inline price correction for an unbilled package.
 *
 * Admin-only. Refuses to edit a package already attached to an invoice —
 * at that point the price lives in invoice_line_item.unit_price too, and
 * silently diverging them is a bug surface. If admin needs to correct an
 * invoiced package, that's a separate (unimplemented) "credit / reissue"
 * flow, not a price edit.
 */
export async function updatePackagePrice(params: {
  packageId: string
  newPrice: number
}): Promise<{ newPrice?: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  if (!Number.isFinite(params.newPrice) || params.newPrice <= 0) {
    return { error: 'Price must be greater than $0' }
  }

  const db = createAdminClient()

  const { data: pkg, error: readErr } = await db
    .from('lesson_package')
    .select('id, invoice_id, billed_to_id')
    .eq('id', params.packageId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!pkg) return { error: 'Package not found' }
  if (pkg.invoice_id) {
    return { error: 'This package is already on an invoice. Price cannot be edited.' }
  }

  const { error: updErr } = await db
    .from('lesson_package')
    .update({ package_price: params.newPrice })
    .eq('id', params.packageId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${pkg.billed_to_id}`)
  return { newPrice: params.newPrice }
}

/**
 * Inline price correction for an unbilled event. Mirrors updatePackagePrice
 * — refuses to edit once the event is attached to an invoice.
 */
export async function updateEventPrice(params: {
  eventId: string
  newPrice: number
}): Promise<{ newPrice?: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  if (!Number.isFinite(params.newPrice) || params.newPrice <= 0) {
    return { error: 'Price must be greater than $0' }
  }

  const db = createAdminClient()

  const { data: event, error: readErr } = await db
    .from('event')
    .select('id, invoice_id, host_id')
    .eq('id', params.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!event) return { error: 'Event not found' }
  if (event.invoice_id) {
    return { error: 'This event is already on an invoice. Price cannot be edited.' }
  }

  const { error: updErr } = await db
    .from('event')
    .update({ price: params.newPrice })
    .eq('id', params.eventId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath(`/chia/people/${event.host_id}`)
  revalidatePath('/chia/lessons-events')
  return { newPrice: params.newPrice }
}

/**
 * Mark a lesson_package or event as "don't bill" (comp, cash-paid, traded,
 * etc). Keeps the row on the calendar / person profile but removes it from
 * Unbilled Products. Reversible via unskipBilling.
 *
 * Refused if the source already has an invoice_id — billing already happened
 * via the normal path, no need to skip. Different from "cancel" which changes
 * status; skip is strictly about "we're not going to Stripe-invoice this."
 */
export async function skipBilling(params: {
  source:  'package' | 'event'
  id:      string
  reason?: string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()
  const table = params.source === 'package' ? 'lesson_package' : 'event'
  const personFk = params.source === 'package' ? 'billed_to_id' : 'host_id'

  const { data: row, error: readErr } = await db
    .from(table)
    .select(`id, invoice_id, billing_skipped_at, ${personFk}`)
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!row) return { error: 'Not found' }
  if ((row as any).invoice_id) return { error: 'Already invoiced — skip does not apply.' }
  if ((row as any).billing_skipped_at) return { error: 'Already marked as skipped.' }

  const { error: updErr } = await db
    .from(table)
    .update({
      billing_skipped_at:     new Date().toISOString(),
      billing_skipped_reason: params.reason?.trim() || null,
    })
    .eq('id', params.id)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath('/chia/lessons-events')
  const personId = (row as any)[personFk]
  if (personId) revalidatePath(`/chia/people/${personId}`)
  if (params.source === 'event') revalidatePath(`/chia/lessons-events/events/${params.id}`)
  return {}
}

/**
 * Undo skipBilling — the source goes back into the Unbilled Products queue.
 * Useful if an admin accidentally skipped or if terms changed.
 */
export async function unskipBilling(params: {
  source: 'package' | 'event'
  id:     string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Not authorized' }

  const db = createAdminClient()
  const table = params.source === 'package' ? 'lesson_package' : 'event'
  const personFk = params.source === 'package' ? 'billed_to_id' : 'host_id'

  const { data: row, error: readErr } = await db
    .from(table)
    .select(`id, billing_skipped_at, ${personFk}`)
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!row) return { error: 'Not found' }
  if (!(row as any).billing_skipped_at) return { error: 'This row is not currently skipped.' }

  const { error: updErr } = await db
    .from(table)
    .update({
      billing_skipped_at:     null,
      billing_skipped_reason: null,
    })
    .eq('id', params.id)

  if (updErr) return { error: updErr.message }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath('/chia/lessons-events')
  const personId = (row as any)[personFk]
  if (personId) revalidatePath(`/chia/people/${personId}`)
  if (params.source === 'event') revalidatePath(`/chia/lessons-events/events/${params.id}`)
  return {}
}
