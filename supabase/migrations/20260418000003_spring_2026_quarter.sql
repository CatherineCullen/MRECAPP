-- Add a Spring 2026 quarter covering Mar 7 – May 31 so the dev site has a
-- current quarter that actually contains today's date. Summer 2026 exists
-- already but is dated from June 1 onwards, which left an April gap where
-- currentQuarter resolution either returned nothing or fell through to
-- whatever was flagged is_active.
--
-- Also flips any currently-active quarter off so Spring is the single
-- active one. No subscriptions will be attached to Spring (it's purely a
-- "covers the current date" placeholder while we wait for the Summer
-- migration cutover).

-- Make sure no other quarter holds is_active
UPDATE public.quarter SET is_active = false WHERE is_active = true;

-- Insert Spring 2026 if it doesn't already exist (keyed by label for
-- idempotency — so re-running the migration doesn't create duplicates).
INSERT INTO public.quarter (label, start_date, end_date, mr_year, is_active)
SELECT 'Spring 2026', '2026-03-07', '2026-05-31', 2026, true
WHERE NOT EXISTS (SELECT 1 FROM public.quarter WHERE label = 'Spring 2026' AND deleted_at IS NULL);

-- If the row already existed (from an earlier attempt), make sure its
-- dates + active flag match what we want.
UPDATE public.quarter
SET start_date = '2026-03-07',
    end_date   = '2026-05-31',
    mr_year    = 2026,
    is_active  = true
WHERE label = 'Spring 2026' AND deleted_at IS NULL;
