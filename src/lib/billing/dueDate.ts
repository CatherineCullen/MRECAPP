/**
 * Due-date policy.
 *
 * Two flavors of CHIA invoice need different due dates:
 *
 *   - `upon_receipt` — one-off lessons (evaluations, extras), one-off
 *     events, and the FIRST month of a brand-new monthly subscription.
 *     The rider hasn't established a recurring relationship yet, so
 *     there's no future month to anchor a due date to.
 *
 *   - `firstOfMonth` — boarding bills (due 1st of the month after the
 *     billed period) and renewing monthly subscriptions (due 1st of
 *     the lesson month being billed). Both end up at "the 1st of some
 *     month"; callers compute which one.
 *
 * Both shapes feed into a chia invoice row's `due_date` (always set,
 * yyyy-mm-dd) and into NMI's `add_invoice` parameters. NMI accepts
 * either `payment_terms: 'upon_receipt'` or an explicit `due_date`
 * field — we use `payment_terms` for the upon-receipt case and
 * explicit `due_date` for fixed dates.
 */

export type DuePolicy =
  | { kind: 'upon_receipt' }
  | { kind: 'firstOfMonth'; year: number; month: number }

export type DueDateOutcome = {
  /** Stored on `invoice.due_date`. yyyy-mm-dd. */
  chiaDueDate: string
  /** NMI `payment_terms` field; only set for upon-receipt. */
  nmiPaymentTerms?: 'upon_receipt'
  /** NMI explicit `due_date` field; only set for fixed-date policies. */
  nmiDueDate?: string
}

export function dueDateForPolicy(policy: DuePolicy, today: Date = new Date()): DueDateOutcome {
  if (policy.kind === 'upon_receipt') {
    const iso = today.toISOString().slice(0, 10)
    return { chiaDueDate: iso, nmiPaymentTerms: 'upon_receipt' }
  }
  // firstOfMonth — first day of the (year, month) the caller specified.
  const iso = `${policy.year}-${String(policy.month).padStart(2, '0')}-01`
  return { chiaDueDate: iso, nmiDueDate: iso }
}

/**
 * Convenience: given an existing chia invoice's due_date string, reconstruct
 * the NMI fields we'd send. Used by `sendChiaInvoice` which works off an
 * already-created chia invoice rather than computing fresh.
 */
export function nmiFieldsForExistingDueDate(
  dueDateIso: string,
  today: Date = new Date(),
): { nmiPaymentTerms?: 'upon_receipt'; nmiDueDate?: string } {
  const todayIso = today.toISOString().slice(0, 10)
  if (dueDateIso <= todayIso) {
    return { nmiPaymentTerms: 'upon_receipt' }
  }
  return { nmiDueDate: dueDateIso }
}
