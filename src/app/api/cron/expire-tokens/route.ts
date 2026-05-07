import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel invokes this route on the cron schedule and passes
// Authorization: Bearer <CRON_SECRET>. Same secret as the other crons,
// set in Vercel env vars. In dev, skip the check so the route can be
// hit manually for testing.
function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Daily cron — flips Available makeup tokens past their official expiry
 * to Expired. Tokens auto-expire 10 days from issuance under the monthly
 * model (ADR-0020); this job is the automation. Admins still have the
 * "Batch-Expire Past Due" button on the Tokens list for manual sweeps,
 * but in steady state nothing should ever be past-due-and-Available.
 *
 * Idempotent: re-running on the same day is a no-op once everything is
 * already flipped. Used/Scheduled tokens are never touched.
 *
 * No notifications — riders don't need to hear from us when an unused
 * token quietly expires. They saw the expiry date when the token was
 * issued; admin sees the row in the Expired filter on the Tokens list.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db    = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const now   = new Date().toISOString()

  const { data, error } = await db
    .from('makeup_token')
    .update({
      status:            'expired',
      status_changed_at: now,
      updated_at:        now,
    })
    .eq('status', 'available')
    .lt('official_expires_at', today)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ expired: data?.length ?? 0 })
}
