'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * Generate a URL-safe random token for a provider QR code. Base64url without
 * padding; ~128 bits of entropy. Good enough for an unguessable URL that
 * attributes a service log — it's not a credential.
 */
function randomToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create a new per-provider QR code. Requires an existing Person with the
 * service_provider role. Token is auto-generated; we never show it to the
 * admin as a string — they copy the URL or print it.
 */
export async function createProviderQr(args: {
  providerPersonId: string
  serviceId:        string
}): Promise<{ error?: string; id?: string }> {
  const supabase = createAdminClient()
  const user     = await getCurrentUser()

  // Guard: person must have the service_provider role. Otherwise the logging
  // page's "who is this?" attribution becomes nonsense.
  const { data: hasRole } = await supabase
    .from('person_role')
    .select('person_id')
    .eq('person_id', args.providerPersonId)
    .eq('role', 'service_provider')
    .maybeSingle()
  if (!hasRole) return { error: 'Selected person does not have the Service Provider role' }

  // Guard: service must exist + be active (deactivated services shouldn't get
  // new QR codes — old ones can remain for historical reference).
  const { data: svc } = await supabase
    .from('board_service')
    .select('id, is_active, is_recurring_monthly')
    .eq('id', args.serviceId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!svc)                         return { error: 'Service not found' }
  if (!svc.is_active)               return { error: 'Service is deactivated' }
  if (svc.is_recurring_monthly)     return { error: 'Monthly Board cannot have a QR code' }

  const { data, error } = await supabase
    .from('provider_qr_code')
    .insert({
      provider_person_id: args.providerPersonId,
      service_id:         args.serviceId,
      token:              randomToken(),
      is_active:          true,
      created_by:         user?.personId ?? null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/chia/boarding/qr-codes')
  return { id: data.id }
}

export async function setProviderQrActive(id: string, active: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('provider_qr_code')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/chia/boarding/qr-codes')
  return {}
}

/**
 * Generate the per-provider training-ride QR row for any training ride
 * provider who doesn't have one yet. Idempotent — safe to call on every
 * page load; ON CONFLICT DO NOTHING via the UNIQUE on provider_person_id.
 */
export async function ensureTrainingRideProviderQrs(): Promise<void> {
  const supabase = createAdminClient()
  const user     = await getCurrentUser()

  const { data: providers } = await supabase
    .from('person')
    .select('id')
    .eq('is_training_ride_provider', true)
    .is('deleted_at', null)
  if (!providers?.length) return

  const { data: existing } = await supabase
    .from('training_ride_provider_qr')
    .select('provider_person_id')
    .in('provider_person_id', providers.map(p => p.id))
  const existingIds = new Set((existing ?? []).map(e => e.provider_person_id))

  const missing = providers.filter(p => !existingIds.has(p.id))
  if (!missing.length) return

  await supabase
    .from('training_ride_provider_qr')
    .insert(missing.map(p => ({
      provider_person_id: p.id,
      token:              randomToken(),
      is_active:          true,
      created_by:         user?.personId ?? null,
    })))
}

export async function setTrainingRideProviderQrActive(id: string, active: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('training_ride_provider_qr')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/chia/boarding/qr-codes')
  return {}
}
