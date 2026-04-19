import 'server-only'

/**
 * Global kill switch for outbound, customer-visible side effects.
 *
 * Purpose
 * -------
 * During build + preview testing we load real boarder and rider records
 * into the DB so we can verify behavior against lifelike data. We do NOT
 * want those real people receiving real emails, texts, or Stripe invoices
 * as a result. This module is the single gate that prevents that.
 *
 * Contract
 * --------
 *   Stripe live-mode writes that would email a customer (invoice finalize
 *   with collection_method=send_invoice, or sendInvoice) are gated.
 *   Stripe test-mode writes are inherently safe — Stripe does not deliver
 *   test-mode invoice emails to real inboxes, it simulates them in the
 *   dashboard — so those pass through without a check.
 *
 *   Email (Resend) and SMS (Twilio) sends are ALWAYS gated, regardless of
 *   mode. Those providers don't have a safe "test mode" that keeps
 *   delivery internal the way Stripe does.
 *
 * To enable outbound at launch
 * ----------------------------
 *   Set OUTBOUND_ENABLED=true in the production environment only.
 *   Keep it unset (or 'false') in dev, preview, and staging.
 *
 * Defense in depth
 * ----------------
 *   We also use placeholder emails and blank phones on Person records
 *   until cutover, so that even if the gate is bypassed, outbound routes
 *   to the admin rather than the real person. See docs/outbound-kill-switch.md.
 */

export type OutboundChannel =
  | 'stripe_invoice_finalize'
  | 'stripe_invoice_send'
  | 'email'
  | 'sms'

/** True iff OUTBOUND_ENABLED is explicitly set to 'true'. Default: false. */
export function isOutboundEnabled(): boolean {
  return process.env.OUTBOUND_ENABLED === 'true'
}

/** True iff the Stripe secret key is a live-mode key (sk_live_…). */
export function isStripeLiveMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  return key.startsWith('sk_live_')
}

export class OutboundDisabledError extends Error {
  channel: OutboundChannel
  constructor(channel: OutboundChannel, reason: string) {
    super(
      `Outbound ${channel} blocked: ${reason}. ` +
        `Set OUTBOUND_ENABLED=true (production only) to allow.`,
    )
    this.name = 'OutboundDisabledError'
    this.channel = channel
  }
}

/**
 * Guard for Stripe operations that cause Stripe to email the customer.
 * No-op in Stripe test mode (inherently safe). In live mode, throws unless
 * OUTBOUND_ENABLED is set.
 */
export function assertStripeOutboundAllowed(
  channel: 'stripe_invoice_finalize' | 'stripe_invoice_send',
): void {
  if (!isStripeLiveMode()) return
  if (!isOutboundEnabled()) {
    throw new OutboundDisabledError(
      channel,
      'Stripe is in live mode but OUTBOUND_ENABLED is not set',
    )
  }
}

/**
 * Guard for direct-outbound providers (Resend email, Twilio SMS). Always
 * gated — no safe test mode. Call this from adapter layer when those are
 * wired up.
 */
export function assertDirectOutboundAllowed(channel: 'email' | 'sms'): void {
  if (!isOutboundEnabled()) {
    throw new OutboundDisabledError(channel, 'OUTBOUND_ENABLED is not set')
  }
}
