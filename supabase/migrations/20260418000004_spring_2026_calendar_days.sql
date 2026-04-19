-- Seed barn_calendar_day rows for Spring 2026 (Mar 7 – May 31).
-- The earlier migration (20260418000003) inserted the quarter row but no
-- calendar days, so the New Subscription preview was returning 0 dates —
-- generateLessonDates iterates barn_calendar_day, not the quarter range.
--
-- Idempotent: ON CONFLICT (date) DO NOTHING so re-running is safe and so
-- we don't clobber any closures/makeup flags the admin has set by hand.

INSERT INTO public.barn_calendar_day (date, quarter_id, barn_closed, is_makeup_day)
SELECT gs::date, q.id, false, false
FROM public.quarter q,
     generate_series(q.start_date, q.end_date, '1 day'::interval) gs
WHERE q.label = 'Spring 2026' AND q.deleted_at IS NULL
ON CONFLICT (date) DO NOTHING;

-- Spring 2026 closures / makeup days: none configured for the placeholder
-- quarter. Admin can toggle individual days later if needed.
