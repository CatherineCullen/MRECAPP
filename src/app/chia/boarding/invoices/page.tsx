import { loadQueue } from './_lib/loadQueue'
import QueueView from './_components/QueueView'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

/**
 * Review & Allocate — the first half of the monthly board billing workflow.
 *
 * Always-on model: as service logs are recorded by barn workers and admin
 * adds ad hoc charges, BillingLineItems accumulate here grouped by horse.
 * Each item is allocated across that horse's billing contacts. When ready,
 * admin clicks Generate Invoices — every Reviewed item is rolled into one
 * Invoice per person (Monthly Board for the upcoming month plus the past
 * month's a la carte services on one bill, industry-standard mixed format).
 * Items left Draft at generation time carry forward automatically.
 *
 * Page-load seeding:
 *  - Monthly Board line seeded for every active boarder horse with billing
 *    contacts, if one hasn't been seeded in the current calendar month yet.
 *  - Any board_service_log not already staged as a billing_line_item flows
 *    in as a Draft line.
 *
 * Horses with no billing contacts are silently skipped.
 */
export default async function InvoicesPage() {
  const user = await getCurrentUser()
  if (!user?.isAdmin) redirect('/chia')

  const snapshot = await loadQueue()

  const userLabel =
    [user.preferredName ?? user.firstName, user.lastName].filter(Boolean).join(' ') || 'Admin'

  return <QueueView snapshot={snapshot} userLabel={userLabel} />
}
