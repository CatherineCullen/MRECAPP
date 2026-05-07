import 'server-only'

/**
 * Single shared NMI client for server-side code only. Reads credentials and
 * endpoint from the environment; throws at import-time if missing so we fail
 * loud rather than producing opaque 401s from the NMI gateway later.
 *
 * Never import this file from client components.
 *
 * NMI's HTTP API is a single endpoint (`/api/transact.php`) that switches
 * behavior based on which top-level verb is sent in the request body
 * (`type=` for transactions, `invoicing=` for invoices, `customer_vault=`
 * for vault operations). We wrap it in a single `nmiCall` that handles
 * auth, encoding, response parsing, and error normalization.
 */

// Lazy env getters — module-level throws break `next build`'s page-data
// collection pass. Validate at call time so the error still surfaces
// loudly, just at the first request rather than at import.
function securityKey(): string {
  const v = process.env.NMI_SECURITY_KEY
  if (!v) {
    throw new Error(
      'NMI_SECURITY_KEY is not set. Add it to app/.env.local — use the Merchant ' +
        'private API key (the one labeled "api (Payment and Query APIs)" with ' +
        'sensitivity "private") from the NMI portal.',
    )
  }
  return v
}
function apiBase(): string {
  const v = process.env.NMI_API_BASE
  if (!v) {
    throw new Error(
      'NMI_API_BASE is not set. Add it to app/.env.local. For sandbox use ' +
        'https://sandbox.nmi.com/api/transact.php; live URL TBD via TouchSuite.',
    )
  }
  return v
}

/**
 * Parsed NMI response. NMI returns form-urlencoded bodies regardless of
 * which verb you sent. Common fields are typed; everything else falls
 * through as string | undefined for downstream callers to read.
 */
export type NmiResponse = {
  /** '1' approved, '2' declined, '3' error */
  response: '1' | '2' | '3'
  /** Human-readable response text — includes "REFID:N" suffix on errors */
  responsetext: string
  /** Numeric NMI response code (100 = success, 300 = error, etc.) */
  response_code: string
  authcode?: string
  transactionid?: string
  invoice_id?: string
  customer_vault_id?: string
  type?: string
  orderid?: string
} & Record<string, string | undefined>

/**
 * Thrown when NMI returns response != '1'. Wraps the structured response so
 * callers can read individual fields if they want to differentiate (e.g.
 * "Sandbox accounts must use sandbox.nmi.com" vs "Authentication Failed").
 */
export class NmiError extends Error {
  responseCode: string
  /** REFID extracted from responsetext when present, for tracing in NMI portal logs. */
  refId: string | undefined
  /** Full parsed response — includes everything NMI sent. */
  response: NmiResponse

  constructor(response: NmiResponse) {
    const refMatch = response.responsetext.match(/REFID:(\d+)/)
    super(`NMI error (response=${response.response}, code=${response.response_code}): ${response.responsetext}`)
    this.name = 'NmiError'
    this.responseCode = response.response_code
    this.refId = refMatch?.[1]
    this.response = response
  }
}

/**
 * POST a request to NMI's transact.php endpoint. Adds `security_key`
 * automatically; caller supplies the rest of the params (the verb like
 * `invoicing=add_invoice` plus any operation-specific fields).
 *
 * Returns the parsed response on success (response='1'). Throws NmiError on
 * decline/error responses, or a plain Error on transport-level failures
 * (non-2xx HTTP, network errors, malformed body).
 */
export async function nmiCall(params: Record<string, string | number>): Promise<NmiResponse> {
  // URLSearchParams accepts string values only; coerce numbers (amounts,
  // quantities) here so callers can pass them naturally without .toString().
  const body = new URLSearchParams()
  body.set('security_key', securityKey())
  for (const [k, v] of Object.entries(params)) {
    body.set(k, String(v))
  }

  let res: Response
  try {
    res = await fetch(apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`NMI request failed (network): ${msg}`)
  }

  if (!res.ok) {
    throw new Error(`NMI request failed: HTTP ${res.status} ${res.statusText}`)
  }

  const text = await res.text()
  const parsed = Object.fromEntries(new URLSearchParams(text)) as NmiResponse

  if (parsed.response !== '1') {
    throw new NmiError(parsed)
  }

  return parsed
}
