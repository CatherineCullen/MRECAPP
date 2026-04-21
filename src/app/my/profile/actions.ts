'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { generateIcalToken } from '@/lib/ical'

export async function updateMyProfile(data: {
  phone?:                    string
  address?:                  string
  emergency_contact_name?:   string
  emergency_contact_phone?:  string
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db = createAdminClient()
  const { error } = await db
    .from('person')
    .update({
      phone:                   data.phone                   ?? null,
      address:                 data.address                 ?? null,
      emergency_contact_name:  data.emergency_contact_name  ?? null,
      emergency_contact_phone: data.emergency_contact_phone ?? null,
      updated_at:              new Date().toISOString(),
    })
    .eq('id', user.personId)

  if (error) return { error: error.message }

  revalidatePath('/my/profile')
  return {}
}

export async function toggleNotificationPref(
  type: string,
  channel: 'email' | 'sms',
  optedOut: boolean,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db  = createAdminClient()
  const now = new Date().toISOString()

  // Check if a row already exists
  const { data: existing } = await db
    .from('notification_preference')
    .select('id')
    .eq('person_id', user.personId)
    .eq('notification_type', type as any)
    .eq('channel', channel)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    await db
      .from('notification_preference')
      .update({ opted_out: optedOut, updated_at: now, updated_by: user.personId })
      .eq('id', existing.id)
  } else {
    await db.from('notification_preference').insert({
      person_id:         user.personId,
      notification_type: type as any,
      channel,
      opted_out:         optedOut,
      updated_by:        user.personId,
    })
  }

  revalidatePath('/my/profile')
  return {}
}

/**
 * Issue or rotate the rider's iCal token. Called on first "Show link" and
 * whenever the user clicks "Reset link" — rotating invalidates the old feed
 * URL immediately (the API route 404s on unknown tokens).
 */
export async function rotateIcalToken(): Promise<{ token?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db = createAdminClient()
  const token = generateIcalToken()
  const { error } = await db
    .from('person')
    .update({ ical_token: token, updated_at: new Date().toISOString() })
    .eq('id', user.personId)

  if (error) return { error: error.message }

  revalidatePath('/my/profile')
  return { token }
}
