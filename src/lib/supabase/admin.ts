import { createClient } from '@supabase/supabase-js'

// Admin client uses the service_role key — bypasses RLS.
// ONLY use this in server-side code (API routes, server actions).
// Never expose this client or the service_role key to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
