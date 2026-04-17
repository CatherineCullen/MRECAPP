'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ensureStripeCustomer } from '@/lib/stripe/customer'
import { createAndSendInvoice } from '@/lib/stripe/invoice'
import { getCurrentUser } from '@/lib/auth'

/**
 * Add or remove a single role from a person.
 *
 * Previous implementation used `upsert` with onConflict on (person_id, role),
 * but the unique index is PARTIAL (WHERE deleted_at IS NULL) — Postgres
 * couldn't match the conflict target reliably and the upsert silently failed.
 *
 * This version:
 *   - Add:    restore a soft-deleted row if one exists, otherwise insert fresh.
 *             No-op if already active (idempotent).
 *   - Remove: soft-delete the active row.
 */
export async function toggleRole(personId: string, role: string, add: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()

  if (add) {
    // Already active? Nothing to do.
    const { data: active } = await supabase
      .from('person_role')
      .select('id')
      .eq('person_id', personId)
      .eq('role', role as any)
      .is('deleted_at', null)
      .maybeSingle()
    if (active) return {}

    // Soft-deleted copy we can restore?
    const { data: deleted } = await supabase
      .from('person_role')
      .select('id')
      .eq('person_id', personId)
      .eq('role', role as any)
      .not('deleted_at', 'is', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (deleted) {
      const { error } = await supabase
        .from('person_role')
        .update({ deleted_at: null, assigned_at: new Date().toISOString() })
        .eq('id', deleted.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase
        .from('person_role')
        .insert({ person_id: personId, role: role as any })
      if (error) return { error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('person_role')
      .update({ deleted_at: new Date().toISOString() })
      .eq('person_id', personId)
      .eq('role', role as any)
      .is('deleted_at', null)
    if (error) return { error: error.message }
  }

  revalidatePath(`/chia/people/${personId}`)
  revalidatePath('/chia/people')
  return {}
}

/**
 * Sync a Person to Stripe as a Customer. Idempotent — returns the existing
 * stripe_customer_id if already synced, otherwise creates the Customer and
 * persists the id.
 *
 * Phase 1 smoke test: gives us a button on the person page to confirm the
 * Stripe connection works before Phase B tries to create Invoices.
 */
export async function syncStripeCustomer(
  personId: string
): Promise<{ stripeCustomerId?: string; error?: string }> {
  // Admin-only: Stripe identifiers and billing controls are plumbing for
  // barn staff, not something end users should see or trigger.
  const user = await getCurrentUser()
  if (!user?.isAdmin) {
    return { error: 'Not authorized' }
  }

  try {
    const stripeCustomerId = await ensureStripeCustomer(personId)
    revalidatePath(`/chia/people/${personId}`)
    return { stripeCustomerId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

/**
 * Admin-only Phase B smoke test: create + send a one-off ad-hoc invoice
 * to the given Person. Proves the full Stripe Invoicing pipeline end-to-end:
 *   create customer → create invoice items → finalize → send → webhook →
 *   DB status flips.
 *
 * Not a production feature — the real invoice flows (lesson packages,
 * board, camp) will each have their own builders that populate the
 * per-source FKs on invoice_line_item. This is the test harness.
 */
export async function createTestInvoice(params: {
  personId: string
  description: string
  amount: number
  notes?: string
}): Promise<{
  stripeInvoiceId?: string
  hostedInvoiceUrl?: string | null
  chiaInvoiceId?: string
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) {
    return { error: 'Not authorized' }
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return { error: 'Amount must be greater than $0' }
  }
  if (!params.description.trim()) {
    return { error: 'Description is required' }
  }

  try {
    const result = await createAndSendInvoice({
      personId: params.personId,
      lineItems: [
        {
          description: params.description.trim(),
          unitPrice: params.amount,
          quantity: 1,
        },
      ],
      notes: params.notes?.trim() || undefined,
    })
    revalidatePath(`/chia/people/${params.personId}`)
    return {
      stripeInvoiceId: result.stripeInvoiceId,
      hostedInvoiceUrl: result.hostedInvoiceUrl,
      chiaInvoiceId: result.chiaInvoiceId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
