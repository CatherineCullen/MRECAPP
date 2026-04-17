import { headers } from 'next/headers'

/**
 * Absolute origin for the current request, e.g. "https://app.example.com".
 * Used for QR code URLs — a scan URL has to be absolute or it won't work
 * from a phone's camera.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL if set
 *   2. x-forwarded-proto + host (standard behind a proxy like Netlify)
 *   3. host header directly
 *   4. http://localhost:3000 fallback for dev
 */
export async function getAppOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')

  const h = await headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  if (host) return `${proto}://${host}`

  return 'http://localhost:3000'
}
