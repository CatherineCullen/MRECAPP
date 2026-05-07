import { redirect } from 'next/navigation'

// Quarterly Renewal was removed in PR 3b of the monthly-model rewrite
// (ADR-0019 — replaced by Monthly Billing in a later PR). This file
// exists only to redirect any stale /renewal bookmarks back to the main
// Lessons & Events page; without it, the dynamic `[id]` sibling route
// catches "renewal" as a UUID lookup and crashes on Postgres' UUID
// validation. Delete this file once it's been long enough that no
// bookmarks survive (or replace with a redirect to the future Monthly
// Billing route once that lands).

export default function RemovedQuarterlyRenewalPage(): never {
  redirect('/chia/lessons-events')
}
