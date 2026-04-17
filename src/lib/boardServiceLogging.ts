'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * Shared server action for creating board service logs from any source —
 * barn-worker QR scans, provider QR scans, admin manual entry, horse-page
 * back-fill. All of them funnel through here so the audit trail stays
 * consistent:
 *
 *   - snapshot is_billable + unit_price from the service at log time
 *   - set status based on is_billable (billable → pending_review, else logged)
 *   - write one BoardServiceLog per horse
 *   - mirror each log to a HorseEvent so it shows up on the horse chronology
 *
 * Attribution rules (every log has at least one identifier — see ADR-0011):
 *   - If a user is logged in, `logged_by_id` is set to their person_id
 *   - `logged_by_label` is always set (service name or provider name) so even
 *     if the user is not logged in we have something meaningful to display
 */

export type LogBoardServiceArgs = {
  serviceId:         string
  horses:            { horseId: string; notes?: string }[]
  loggedAt:          string     // ISO timestamp
  loggedByLabel:     string
  logSource:         'qr_code' | 'app' | 'admin'
  providerQrCodeId?: string     // set only for /p scans
}

export async function logBoardServices(args: LogBoardServiceArgs): Promise<{ error?: string; count?: number }> {
  const supabase = createAdminClient()
  const user     = await getCurrentUser()      // may be null on public scans
  const now      = new Date().toISOString()

  if (args.horses.length === 0) return { error: 'Pick at least one horse' }

  // Snapshot the service's billable flag + price so the log entry is stable
  // even if the catalog row changes later. Also acts as a validation step —
  // a deactivated or deleted service can't be logged against.
  const { data: service, error: svcErr } = await supabase
    .from('board_service')
    .select('id, name, is_billable, is_active, is_recurring_monthly, unit_price')
    .eq('id', args.serviceId)
    .is('deleted_at', null)
    .maybeSingle()
  if (svcErr)                   return { error: svcErr.message }
  if (!service)                 return { error: 'Service not found' }
  if (!service.is_active)       return { error: 'Service is deactivated' }
  if (service.is_recurring_monthly) return { error: 'Monthly Board cannot be logged — it is billed automatically' }

  const status: 'pending_review' | 'logged' = service.is_billable ? 'pending_review' : 'logged'

  // Build rows. One BoardServiceLog + one HorseEvent per selected horse.
  // Insert events first so we can link board_service_log.horse_event_id.
  const horseEventRows = args.horses.map(h => ({
    horse_id:         h.horseId,
    event_type:       'board_service' as const,
    title:            service.name,
    notes:            h.notes?.trim() || null,
    recorded_at:      args.loggedAt,
    recorded_by:      user?.personId ?? null,
    board_service_id: service.id,
  }))

  const { data: events, error: evtErr } = await supabase
    .from('horse_event')
    .insert(horseEventRows)
    .select('id, horse_id')
  if (evtErr) return { error: evtErr.message }

  // Pair events back to horses by horse_id. Multiple events for the same
  // horse would be ambiguous, but our insert produced exactly one each.
  const eventByHorse = new Map<string, string>()
  for (const e of events ?? []) eventByHorse.set(e.horse_id, e.id)

  const logRows = args.horses.map(h => ({
    horse_id:            h.horseId,
    service_id:          service.id,
    logged_by_id:        user?.personId ?? null,
    logged_by_label:     args.loggedByLabel,
    log_source:          args.logSource,
    logged_at:           args.loggedAt,
    is_billable:         service.is_billable,
    unit_price:          service.is_billable ? service.unit_price : null,
    notes:               h.notes?.trim() || null,
    provider_qr_code_id: args.providerQrCodeId ?? null,
    status,
    horse_event_id:      eventByHorse.get(h.horseId) ?? null,
  }))

  const { error: logErr } = await supabase
    .from('board_service_log')
    .insert(logRows)
  if (logErr) return { error: logErr.message }

  void now  // reserved — timestamps on horse_event come from args.loggedAt
  return { count: logRows.length }
}

/**
 * Lookup used by scan pages to populate the horse picker:
 * horses this service (per-service scan) or this provider (per-provider scan)
 * has been logged for in the last N days, with their recent-frequency count.
 *
 * Returns an ordered list of { horseId, name, recentCount } descending by
 * count. Empty for first-time scans.
 */
export async function recentHorsesForService(opts: {
  serviceId:  string
  days:       number
  providerQrCodeId?: string
}): Promise<{ horseId: string; name: string; recentCount: number }[]> {
  const supabase = createAdminClient()
  const since    = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000).toISOString()

  let q = supabase
    .from('board_service_log')
    .select(`
      horse_id,
      horse:horse!board_service_log_horse_id_fkey ( id, barn_name )
    `)
    .eq('service_id', opts.serviceId)
    .gte('logged_at', since)
    .neq('status', 'voided')

  if (opts.providerQrCodeId) q = q.eq('provider_qr_code_id', opts.providerQrCodeId)

  const { data } = await q
  const counts = new Map<string, { name: string; n: number }>()
  for (const row of data ?? []) {
    const name = row.horse?.barn_name
    if (!name) continue
    const existing = counts.get(row.horse_id)
    if (existing) existing.n += 1
    else counts.set(row.horse_id, { name, n: 1 })
  }
  return Array.from(counts.entries())
    .map(([id, v]) => ({ horseId: id, name: v.name, recentCount: v.n }))
    .sort((a, b) => b.recentCount - a.recentCount || a.name.localeCompare(b.name))
}
