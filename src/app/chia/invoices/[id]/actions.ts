'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { applyInvoicePaid } from '@/lib/payments/applyInvoicePaid'

/**
 * Manual mark-paid action — invoked from the invoice detail page when
 * admin records cash, check, or an externally-charged NMI payment.
 *
 * Goes through the same `applyInvoicePaid` cascade the NMI webhook
 * handler uses, so a manually-marked invoice has the same downstream
 * effect as one paid via NMI's hosted page (lesson_month → Paid,
 * lessons → scheduled). Idempotent — clicking the button on an
 * already-paid invoice is a no-op rather than a double-flip.
 *
 * Allowed methods reflect what we record in `invoice.paid_method`. The
 * existing column has no CHECK so any string is valid; we constrain
 * here so admin sees a small picker rather than free text.
 *
 * No outbound side effects (no NMI call, no email). This is purely
 * an audit-trail flip — the money already moved out of band; we're
 * recording that fact in the system.
 */

export type ManualPaidMethod = 'cash' | 'check' | 'poynt_terminal' | 'external' | 'other'

export type MarkPaidArgs = {
  invoiceId: string
  method:    ManualPaidMethod
}

export type MarkPaidResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; error: string }

export async function markInvoicePaid(args: MarkPaidArgs): Promise<MarkPaidResult> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const allowed: ManualPaidMethod[] = ['cash', 'check', 'poynt_terminal', 'external', 'other']
  if (!allowed.includes(args.method)) {
    return { ok: false, error: `Invalid payment method: ${args.method}` }
  }

  const db = createAdminClient()

  const result = await applyInvoicePaid({
    db,
    invoiceId:  args.invoiceId,
    paidMethod: args.method,
    // No nmi_transaction_id — this isn't a NMI-side payment.
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath(`/chia/invoices/${args.invoiceId}`)
  revalidatePath('/chia/lessons-events/monthly-billing')
  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath('/chia/boarding/drafts')
  revalidatePath('/chia/boarding/invoices')
  // Rider-facing surfaces (Schedule, Invoices tab) read from invoice +
  // lesson status; mark-paid flips both, so refresh the /my layout too.
  revalidatePath('/my', 'layout')

  return {
    ok:          true,
    alreadyPaid: result.alreadyPaid,
  }
}
