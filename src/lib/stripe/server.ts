import Stripe from 'stripe'

// Single shared Stripe client for server-side code only. Reads the secret
// key from the environment; throws at import-time if missing so we fail
// loud rather than producing opaque 401s from the Stripe API later.
//
// Never import this file from client components.

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  throw new Error(
    'STRIPE_SECRET_KEY is not set. Add it to app/.env.local — use the test-mode ' +
      'secret key (sk_test_...) from the Stripe Dashboard → Developers → API keys.'
  )
}

export const stripe = new Stripe(secretKey, {
  // Pin the API version so silent upgrades don't change behavior.
  // Matches Stripe Node SDK v22 default.
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
  appInfo: {
    name: 'CHIA Barn Management',
    version: '0.1.0',
  },
})
