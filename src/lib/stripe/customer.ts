import 'server-only'
import { stripe } from './server'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

/**
 * Ensure a Stripe Customer exists for this Person, returning its id.
 *
 * CHIA is the source of truth for identity — name, email, phone. On every
 * call we push the latest values to Stripe so the admin never has to edit
 * the same field in two places. If the customer doesn't exist yet, we
 * create one; if it does, we update it.
 *
 * Called lazily — only when we're about to bill someone. Persons who never
 * get an invoice never get a Stripe Customer.
 *
 * The update is best-effort: if Stripe returns an error (e.g. the customer
 * was deleted on the dashboard side), we log and continue with the cached
 * id rather than blocking the invoice flow. Worst case, Stripe errors
 * later at invoice-create time, which is recoverable.
 *
 * Phase 1 scope: just identity sync. Phase 2 adds payment methods, default
 * sources, and SetupIntent for auto-charge.
 */
export async function ensureStripeCustomer(personId: string): Promise<string> {
  const db = createAdminClient()

  const { data: person, error } = await db
    .from('person')
    .select(
      'id, first_name, last_name, preferred_name, is_organization, organization_name, email, phone, stripe_customer_id'
    )
    .eq('id', personId)
    .single()

  if (error || !person) {
    throw new Error(`Person ${personId} not found: ${error?.message ?? 'no rows'}`)
  }

  const name  = displayName(person)
  const email = person.email ?? undefined
  const phone = person.phone ?? undefined

  // Existing customer → push latest identity in case anything changed
  // since last time. No-op on the Stripe side if values already match.
  if (person.stripe_customer_id) {
    try {
      await stripe.customers.update(person.stripe_customer_id, {
        name,
        email,
        phone,
      })
    } catch (e) {
      // Non-fatal: keep using the cached id. The admin may want to know,
      // so we log. If the customer was deleted on the dashboard, the
      // subsequent invoice call will throw with a clearer message.
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[ensureStripeCustomer] update failed', person.stripe_customer_id, msg)
    }
    return person.stripe_customer_id
  }

  // No customer yet — create one.
  const customer = await stripe.customers.create({
    name,
    email,
    phone,
    metadata: {
      // Cross-link for debugging and for webhook reverse-lookup in case the
      // column ever drifts. Stripe metadata is returned on every Customer
      // event payload.
      chia_person_id: person.id,
    },
  })

  const { error: updateError } = await db
    .from('person')
    .update({ stripe_customer_id: customer.id })
    .eq('id', person.id)
    // Defensive: only overwrite if still null. If two callers race, the
    // loser's Customer becomes orphaned in Stripe — harmless in test, and
    // we'd see it via the metadata link. Acceptable Phase 1.
    .is('stripe_customer_id', null)

  if (updateError) {
    throw new Error(`Failed to persist stripe_customer_id: ${updateError.message}`)
  }

  return customer.id
}
