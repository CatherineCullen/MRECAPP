-- Seed barn quarters (Summer 2026 – Winter 2028/2029) and generate all
-- BarnCalendarDay records from the barn's multi-year calendar CSV.
-- Source: Calendar/barn_calendar_2026_2029.csv
--
-- Strategy: insert quarters, generate one row per calendar day via
-- generate_series, then UPDATE the handful of special days.

-- ============================================================
-- QUARTERS
-- ============================================================

WITH q AS (
  INSERT INTO quarter (id, label, mr_year, start_date, end_date, is_active)
  VALUES
    (gen_random_uuid(), 'Summer 2026',      2026, '2026-06-01', '2026-08-31', false),
    (gen_random_uuid(), 'Fall 2026',        2026, '2026-09-01', '2026-11-30', false),
    (gen_random_uuid(), 'Winter 2026/2027', 2026, '2026-12-01', '2027-03-07', false),
    (gen_random_uuid(), 'Spring 2027',      2026, '2027-03-08', '2027-05-31', false),
    (gen_random_uuid(), 'Summer 2027',      2027, '2027-06-01', '2027-08-31', false),
    (gen_random_uuid(), 'Fall 2027',        2027, '2027-09-01', '2027-11-30', false),
    (gen_random_uuid(), 'Winter 2027/2028', 2027, '2027-12-01', '2028-03-07', false),
    (gen_random_uuid(), 'Spring 2028',      2027, '2028-03-08', '2028-05-31', false),
    (gen_random_uuid(), 'Summer 2028',      2028, '2028-06-01', '2028-08-31', false),
    (gen_random_uuid(), 'Fall 2028',        2028, '2028-09-01', '2028-11-30', false),
    (gen_random_uuid(), 'Winter 2028/2029', 2028, '2028-12-01', '2029-03-07', false)
  RETURNING id, start_date, end_date
)

-- ============================================================
-- BARN CALENDAR DAYS — one row per date, default normal day
-- ============================================================

INSERT INTO barn_calendar_day (date, quarter_id, barn_closed, is_makeup_day)
SELECT gs::date, q.id, false, false
FROM q,
     generate_series(q.start_date, q.end_date, '1 day'::interval) gs;


-- ============================================================
-- BARN CLOSURES
-- ============================================================

-- Summer 2026: Jul 4 week
UPDATE barn_calendar_day SET barn_closed = true
WHERE date BETWEEN '2026-06-29' AND '2026-07-05';

-- Fall 2026: Thanksgiving (Thu + Fri)
UPDATE barn_calendar_day SET barn_closed = true
WHERE date IN ('2026-11-26', '2026-11-27');

-- Winter 2026/2027: Holiday closure
UPDATE barn_calendar_day SET barn_closed = true
WHERE date BETWEEN '2026-12-24' AND '2027-01-02';

-- Summer 2027: Jul 4 week
UPDATE barn_calendar_day SET barn_closed = true
WHERE date BETWEEN '2027-06-29' AND '2027-07-05';

-- Fall 2027: Thanksgiving (Thu + Fri)
UPDATE barn_calendar_day SET barn_closed = true
WHERE date IN ('2027-11-25', '2027-11-26');

-- Winter 2027/2028: Holiday closure
UPDATE barn_calendar_day SET barn_closed = true
WHERE date BETWEEN '2027-12-24' AND '2028-01-02';

-- Summer 2028: Jul 4 week
UPDATE barn_calendar_day SET barn_closed = true
WHERE date BETWEEN '2028-06-29' AND '2028-07-05';

-- Fall 2028: Thanksgiving (Sat + Sun — falls Nov 23/24 in 2028)
UPDATE barn_calendar_day SET barn_closed = true
WHERE date IN ('2028-11-23', '2028-11-24');

-- Winter 2028/2029: Holiday closure
UPDATE barn_calendar_day SET barn_closed = true
WHERE date BETWEEN '2028-12-24' AND '2029-01-02';


-- ============================================================
-- MAKEUP WINDOW DAYS
-- ============================================================

-- Summer 2026
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date = '2026-08-31';

-- Fall 2026 (Thanksgiving week makeup window)
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date IN ('2026-11-24', '2026-11-25', '2026-11-28', '2026-11-29', '2026-11-30');

-- Winter 2026/2027 (end-of-quarter makeup window)
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date IN ('2027-03-02', '2027-03-03', '2027-03-07');

-- Spring 2027
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date = '2027-05-31';

-- Summer 2027
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date = '2027-08-31';

-- Fall 2027 (Thanksgiving week makeup window)
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date IN ('2027-11-24', '2027-11-27', '2027-11-28', '2027-11-29', '2027-11-30');

-- Winter 2027/2028 (end-of-quarter makeup window)
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date IN ('2028-03-01', '2028-03-02', '2028-03-06', '2028-03-07');

-- Spring 2028
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date = '2028-05-31';

-- Summer 2028
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date = '2028-08-31';

-- Fall 2028 (Thanksgiving week makeup window)
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date IN ('2028-11-25', '2028-11-26', '2028-11-27', '2028-11-28', '2028-11-29');

-- Winter 2028/2029 (end-of-quarter makeup window)
UPDATE barn_calendar_day SET is_makeup_day = true
WHERE date IN ('2029-03-02', '2029-03-03', '2029-03-07');
