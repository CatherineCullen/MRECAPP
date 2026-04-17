import { loadDrafts } from './_lib/loadDrafts'
import { loadSent } from './_lib/loadSent'
import InvoicesSwitcher from './_components/InvoicesSwitcher'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

/**
 * Invoices — second half of the monthly board invoicing workflow, plus
 * history.
 *
 * Two panes behind a sub-nav:
 *   - Drafts: ready-to-send drafts (status=draft). Batch Send / Discard.
 *   - Sent:   history (sent / opened / paid / overdue), grouped by month.
 *
 * Stripe webhook keeps sent-invoice status in sync. Out-of-band payments
 * (check, cash) are marked paid in the Stripe dashboard — the
 * invoice.paid webhook flips CHIA automatically.
 */
export default async function InvoicesPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const [drafts, sent] = await Promise.all([loadDrafts(), loadSent()])
  return <InvoicesSwitcher drafts={drafts} sent={sent} />
}
