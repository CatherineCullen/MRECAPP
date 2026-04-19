-- Not every horse in the barn pays monthly board. Some are owned by the
-- barn itself (MREC); some are free leases where the owner-on-paper isn't
-- the paying party. Without a way to express this, the Review & Allocate
-- seed indiscriminately adds a Monthly Board line for every active horse
-- with a billing contact, including barn-owned ones — which would bill
-- MREC to itself.
--
-- This flag defaults true (the common case is "yes, this horse pays
-- board") and admin toggles it off for the hodgepodge. Seed logic in
-- loadQueue.ts checks this before inserting a Monthly Board row. Other
-- services (a la carte farrier, vet, etc.) still flow through — an
-- exempt horse can still be charged for specific services if appropriate.
--
-- Naming note: "charges_monthly_board" reads as a business fact
-- ("does this horse charge monthly board?") rather than an implementation
-- detail. Default=true makes the positive phrasing natural.

ALTER TABLE horse
  ADD COLUMN charges_monthly_board boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN horse.charges_monthly_board IS
  'When false, loadQueue.ts skips auto-seeding a Monthly Board line for '
  'this horse each month. Used for barn-owned horses and free-lease '
  'arrangements where the recorded owner is not the paying party. Other '
  'billable services still flow through Review & Allocate.';
