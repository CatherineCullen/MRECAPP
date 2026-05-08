import { redirect } from 'next/navigation'

// Quarterly Renewal was replaced by Monthly Subscriptions under the monthly
// model (ADR-0019). This stub catches stale /renewal bookmarks and
// sends them to the new home. It also prevents the dynamic `[id]`
// sibling route from interpreting "renewal" as a UUID lookup, which
// would crash on Postgres' UUID validation.

export default function RemovedQuarterlyRenewalPage(): never {
  redirect('/chia/lessons-events/monthly-billing')
}
