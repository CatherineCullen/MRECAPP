-- Monthly board is now added explicitly (admin clicks "Add monthly board"
-- and picks the target month) rather than auto-seeded by the page loader.
-- The dedupe was guarding against a concurrency race in the auto-seed; with
-- no auto-seed, the index now blocks legitimate cases — e.g. admin adding
-- May board in late April when April board already exists for the same
-- horse (both rows land in the same created_at month). The form surfaces a
-- soft "already has board for this month" warning instead.

DROP INDEX IF EXISTS billing_line_item_monthly_unique;
