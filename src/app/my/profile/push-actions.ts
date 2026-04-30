'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export interface PushSubscriptionInput {
  endpoint:   string
  p256dh:     string
  auth:       string
  userAgent?: string | null
}

/**
 * Persist a push subscription for the current user. Idempotent on
 * (endpoint) — if the user re-grants permission on a device that
 * previously revoked, the row is reactivated.
 */
export async function savePushSubscription(sub: PushSubscriptionInput): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db = createAdminClient()
  const { error } = await db
    .from('push_subscription')
    .upsert(
      {
        person_id:   user.personId,
        endpoint:    sub.endpoint,
        p256dh:      sub.p256dh,
        auth:        sub.auth,
        user_agent:  sub.userAgent ?? null,
        revoked_at:  null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) return { error: error.message }
  revalidatePath('/my/profile')
  return {}
}

/**
 * Mark a subscription revoked. Called when the user opts out from
 * within the app (browser-side unsubscribe is also fired separately).
 */
export async function revokePushSubscription(endpoint: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const db = createAdminClient()
  const { error } = await db
    .from('push_subscription')
    .update({ revoked_at: new Date().toISOString() })
    .eq('person_id', user.personId)
    .eq('endpoint', endpoint)
  if (error) return { error: error.message }
  revalidatePath('/my/profile')
  return {}
}
