import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { OutboundDisabledError, isOutboundEnabled } from '@/lib/outbound'

const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:marlbororidgeequestriancenter@gmail.com'

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body:  string
  url:   string
  tag?:  string
}

/**
 * Send a push payload to all active subscriptions for a person. Errors
 * per-subscription are swallowed and logged; a 410/404 from the push
 * service marks that subscription as revoked so future sends skip it.
 *
 * Respects the outbound kill switch — same gate as Twilio/Resend.
 */
export async function sendPushToPerson(personId: string, payload: PushPayload): Promise<void> {
  if (!isOutboundEnabled()) {
    // Match the silent-no-op behavior of notify() — kill switch should
    // never break the calling action.
    throw new OutboundDisabledError('push', 'OUTBOUND_ENABLED is not set')
  }
  if (!ensureConfigured()) {
    console.warn('[push] VAPID keys not configured — skipping push send')
    return
  }

  const db = createAdminClient()
  const { data: subs } = await db
    .from('push_subscription')
    .select('id, endpoint, p256dh, auth')
    .eq('person_id', personId)
    .is('revoked_at', null)

  if (!subs || subs.length === 0) return

  const json = JSON.stringify(payload)

  await Promise.allSettled(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        json,
      )
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Subscription expired/unsubscribed by the browser. Mark revoked
        // so we stop trying.
        await db
          .from('push_subscription')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', sub.id)
      } else {
        console.error('[push] send failed', { sub: sub.endpoint.slice(-12), status, err })
      }
    }
  }))
}
