import 'server-only'
import crypto from 'node:crypto'

/**
 * NMI webhook signature verification + event normalization.
 *
 * NMI delivers webhooks as JSON POSTs to the URL configured in the merchant
 * portal (Settings → Webhooks). Each request carries a `webhook-signature`
 * header in the format `t=<unix_timestamp>,s=<hex_hmac>`. Format is
 * essentially identical to Stripe's `Stripe-Signature` header.
 *
 * Verification:
 *   1. Parse `t` and `s` from the header.
 *   2. Reject if `t` is too old (replay protection) — default tolerance 5min.
 *   3. Compute HMAC-SHA256 over `<t>.<rawBody>` using the signing key from
 *      the portal (NMI_WEBHOOK_SIGNING_KEY env var).
 *   4. Constant-time compare against `s`.
 *
 * Verified payload shape (2026-05-07 sandbox probe):
 *   - event_type: 'transaction.sale.success' | 'transaction.sale.failure' | etc.
 *   - event_id: uuid (idempotency key — don't double-process)
 *   - event_body.order_id: the orderid we stamped on add_invoice == chia_invoice.id
 *   - event_body.transaction_id: NMI's payment transaction id (distinct from invoice_id)
 *   - event_body.requested_amount: '1.00' (verify against our invoice.total)
 *   - event_body.currency: 'USD'
 *   - event_body.features.is_test_mode: boolean — production handler must reject true
 *   - event_body.merchant_defined_fields.1: backup correlation id we stamped
 *
 * The exact concatenation format for HMAC (`<t>.<body>` vs `<t><body>` vs other)
 * is the one detail we couldn't fully verify from public docs. Code below uses
 * `<t>.<body>` (Stripe's pattern) — if NMI rejects, try the alternative.
 */

// Lazy env getter — module-level throws break `next build`'s page-data
// collection pass. Validate at call time so the error still surfaces
// loudly, just at the first webhook rather than at import.
function signingKey(): string {
  const v = process.env.NMI_WEBHOOK_SIGNING_KEY
  if (!v) {
    throw new Error(
      'NMI_WEBHOOK_SIGNING_KEY is not set. Generate it in the NMI portal at ' +
        'Settings → Webhooks (per-endpoint signing key shown after Save) and ' +
        'add to app/.env.local.',
    )
  }
  return v
}

const TIMESTAMP_TOLERANCE_SECONDS = 300 // 5 minutes; rejects replays older than this

export type NmiWebhookEvent = {
  event_id: string
  event_type: string
  event_body: {
    transaction_id?: string
    order_id?: string
    requested_amount?: string
    currency?: string
    merchant_defined_fields?: Record<string, string>
    features?: {
      is_test_mode?: boolean
    }
    merchant?: {
      id?: string
      name?: string
    }
    [key: string]: unknown
  }
}

/**
 * Normalized event after verify + categorize. Webhook handlers branch on
 * `kind` rather than the raw `event_type` string so adding new event
 * mappings is bounded to this file.
 */
export type NormalizedNmiEvent =
  | { kind: 'invoice_paid'; eventId: string; chiaInvoiceId: string; nmiTransactionId: string; amount: number; isTestMode: boolean; raw: NmiWebhookEvent }
  | { kind: 'invoice_payment_failed'; eventId: string; chiaInvoiceId: string; isTestMode: boolean; raw: NmiWebhookEvent }
  | { kind: 'unknown'; eventId: string; eventType: string; raw: NmiWebhookEvent }

export class NmiSignatureError extends Error {
  constructor(reason: string) {
    super(`NMI webhook signature verification failed: ${reason}`)
    this.name = 'NmiSignatureError'
  }
}

/**
 * Parse the `webhook-signature` header into its `t` and `s` components.
 * Header format: `t=1778166871,s=6387d73a929d8f6955d7956...`
 */
function parseSignatureHeader(header: string): { timestamp: number; signature: string } {
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=')
    if (k && v) acc[k.trim()] = v.trim()
    return acc
  }, {})

  const t = parts.t
  const s = parts.s
  if (!t || !s) {
    throw new NmiSignatureError(`malformed header (missing t or s): ${header}`)
  }

  const timestamp = Number.parseInt(t, 10)
  if (!Number.isFinite(timestamp)) {
    throw new NmiSignatureError(`invalid timestamp in header: ${t}`)
  }

  return { timestamp, signature: s }
}

/**
 * Verify a webhook request and return the parsed event. Throws
 * NmiSignatureError on any verification failure (bad signature, stale
 * timestamp, malformed header). Throws plain Error on JSON parse failure.
 */
export function verifyNmiWebhook(rawBody: string, signatureHeader: string | null): NmiWebhookEvent {
  if (!signatureHeader) {
    throw new NmiSignatureError('missing webhook-signature header')
  }

  const { timestamp, signature } = parseSignatureHeader(signatureHeader)

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new NmiSignatureError(
      `timestamp ${timestamp} outside tolerance (now=${nowSeconds}, tolerance=${TIMESTAMP_TOLERANCE_SECONDS}s) — possible replay`,
    )
  }

  // Compute expected signature. Pattern: HMAC-SHA256 over `<t>.<rawBody>`
  // using the signing key, hex-encoded. Mirrors Stripe's verification
  // approach — if NMI uses a different separator (no `.`), this will
  // fail in sandbox testing and we'll adjust.
  const expected = crypto
    .createHmac('sha256', signingKey())
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  // Constant-time compare to avoid timing attacks. Both buffers must be
  // the same length or timingSafeEqual throws — guard before calling.
  const expectedBuf = Buffer.from(expected, 'hex')
  const sigBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    throw new NmiSignatureError('signature mismatch')
  }

  let parsed: NmiWebhookEvent
  try {
    parsed = JSON.parse(rawBody) as NmiWebhookEvent
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`NMI webhook body is not valid JSON: ${msg}`)
  }

  return parsed
}

/**
 * Categorize a verified webhook event into one of our domain-meaningful
 * kinds. Webhook handler branches on the returned `kind` rather than the
 * raw event_type string — adding new mappings is bounded to this function.
 *
 * `chia_invoice_id` is read from `event_body.order_id` (which we stamp via
 * the orderid param on add_invoice) with `merchant_defined_fields.1` as
 * a backup. Returns `unknown` for events we don't currently handle.
 */
export function normalizeNmiEvent(event: NmiWebhookEvent): NormalizedNmiEvent {
  const eventId = event.event_id
  const isTestMode = event.event_body?.features?.is_test_mode === true
  const chiaInvoiceId =
    event.event_body?.order_id ?? event.event_body?.merchant_defined_fields?.['1'] ?? ''

  switch (event.event_type) {
    case 'transaction.sale.success': {
      const txId = event.event_body?.transaction_id ?? ''
      const amount = Number.parseFloat(event.event_body?.requested_amount ?? '0')
      if (!chiaInvoiceId) {
        // Webhook fired but we can't correlate it to one of our invoices —
        // possibly a transaction created outside CHIA (manual sale in the
        // NMI portal). Log and treat as unknown so the handler can store
        // it for inspection without crashing.
        return { kind: 'unknown', eventId, eventType: event.event_type, raw: event }
      }
      return { kind: 'invoice_paid', eventId, chiaInvoiceId, nmiTransactionId: txId, amount, isTestMode, raw: event }
    }
    case 'transaction.sale.failure': {
      if (!chiaInvoiceId) {
        return { kind: 'unknown', eventId, eventType: event.event_type, raw: event }
      }
      return { kind: 'invoice_payment_failed', eventId, chiaInvoiceId, isTestMode, raw: event }
    }
    default:
      return { kind: 'unknown', eventId, eventType: event.event_type, raw: event }
  }
}
