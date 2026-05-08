'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

/**
 * Lesson-invoice actions surviving the monthly-model rewrite.
 *
 * The original Stripe-driven quarterly flow lived here:
 *   generate → drafts → send → sent → webhook flips paid
 * Plus admin actions to discard a draft or void a sent invoice.
 *
 * After PR 3b/1 deleted the Quarterly Renewal UI and PRs 5-7 stood up
 * the monthly model end-to-end (Monthly Subscriptions tab batch send via
 * NMI), the only function still reachable from a live UI is
 * `voidAndCancelLessonInvoice`, called by `LessonSentView` on the
 * Invoices tab. The other functions and their UI components
 * (LessonDraftsView, InvoicesSwitcher) were dead code referencing the
 * removed flow — deleted in PR 8c-1.
 *
 * `voidAndCancelLessonInvoice` is also simplified: under NMI we don't
 * call the provider to void (refunds are out-of-band — admin handles
 * in the NMI portal if money needs to come back). The CHIA-side
 * cascade also simplifies: under the monthly model, lessons hang off
 * `lesson_month`, not directly off `lesson_subscription` via
 * `invoice_id`. So voiding a CHIA invoice is just a status flip;
 * downstream lesson_month rollback comes through the Monthly Subscriptions
 * tab's "Mark Not Continuing" flow if admin needs it.
 *
 * Sent invoices remain on the Sent view as audit history regardless of
 * status (paid / voided).
 */

export async function voidAndCancelLessonInvoice(params: {
  invoiceId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { ok: false, error: 'Not authorized' }

  const db = createAdminClient()

  const { data: inv, error: invErr } = await db
    .from('invoice')
    .select('id, status, deleted_at')
    .eq('id', params.invoiceId)
    .single()

  if (invErr || !inv) return { ok: false, error: 'Invoice not found' }
  if (inv.deleted_at) return { ok: false, error: 'Invoice is already deleted' }
  if (inv.status === 'paid') {
    return { ok: false, error: "Paid invoices can't be voided here — refund in the NMI portal instead." }
  }
  if (inv.status === 'draft') {
    return { ok: false, error: 'Use Discard on draft invoices.' }
  }
  if (inv.status === 'voided') {
    return { ok: false, error: 'Already voided.' }
  }

  // Flip CHIA invoice status to 'voided'. We keep the row (and its line
  // items) so the Sent view surfaces it as a visible audit entry —
  // grayed, grouped under a "Voided" section — instead of having it
  // silently vanish.
  const { error: updateErr } = await db
    .from('invoice')
    .update({ status: 'voided' })
    .eq('id', inv.id)

  if (updateErr) {
    return { ok: false, error: `Failed to void invoice: ${updateErr.message}` }
  }

  // Unstamp source rows so they return to the Unbilled queue. Voiding
  // means "this invoice was a mistake / we won't collect on this" —
  // admin needs the items back to either rebuild a corrected invoice
  // or skip them. The voided invoice's line items remain pinned to
  // the dead invoice for audit; the source rows are independent
  // entities that need to flow somewhere.
  //
  // For monthly subscription invoices, lesson_month rows also revert
  // to status='Pending' so they reappear on the Monthly Subscriptions tab
  // for the original (year, month).
  const sourceErrors: string[] = []

  const { error: pkgErr } = await db
    .from('lesson_package')
    .update({ invoice_id: null })
    .eq('invoice_id', inv.id)
  if (pkgErr) sourceErrors.push(`lesson_package: ${pkgErr.message}`)

  const { error: evtErr } = await db
    .from('event')
    .update({ invoice_id: null })
    .eq('invoice_id', inv.id)
  if (evtErr) sourceErrors.push(`event: ${evtErr.message}`)

  const { error: monthErr } = await db
    .from('lesson_month')
    .update({ invoice_id: null, status: 'Pending' })
    .eq('invoice_id', inv.id)
  if (monthErr) sourceErrors.push(`lesson_month: ${monthErr.message}`)

  if (sourceErrors.length > 0) {
    // The invoice is voided either way — partial unstamp is still better
    // than a fully orphaned invoice. Surface the errors so admin can
    // reconcile manually if needed.
    return {
      ok: false,
      error: `Invoice voided, but source-row unstamping had problems: ${sourceErrors.join('; ')}`,
    }
  }

  revalidatePath('/chia/lessons-events/unbilled')
  revalidatePath('/chia/lessons-events/monthly-billing')
  revalidatePath('/chia/lessons-events')
  // Voiding can flip lesson_month back to Pending and unstamp source rows;
  // the rider's Schedule + Invoices tab need to reflect that.
  revalidatePath('/my', 'layout')

  return { ok: true }
}
