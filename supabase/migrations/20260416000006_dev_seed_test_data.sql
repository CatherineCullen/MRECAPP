-- DEV SEED — test cast of people, horses, subscriptions, and training rides
-- so Catherine can exercise the scheduling flows end-to-end without
-- manually clicking through every form.
--
-- Every record is prefixed "TEST " so it's trivially grep-able and droppable.
-- To remove all test data later, run the cleanup block at the end of this file
-- in reverse (commented out).

-- ============================================================
-- 1) Activate the Summer 2026 quarter (so scheduling UI has a current context)
-- ============================================================

UPDATE quarter SET is_active = false WHERE is_active = true;
UPDATE quarter SET is_active = true  WHERE label = 'Summer 2026';


-- ============================================================
-- 2) Seed people, roles, horses, and subscriptions in a DO block
-- ============================================================

DO $$
DECLARE
  -- People
  paul_id       uuid := gen_random_uuid();
  maria_id      uuid := gen_random_uuid();
  chris_id      uuid := gen_random_uuid();
  alex_id       uuid := gen_random_uuid();
  rachel_id     uuid := gen_random_uuid();
  emma_id       uuid := gen_random_uuid();
  sofia_id      uuid := gen_random_uuid();
  jake_id       uuid := gen_random_uuid();
  olivia_id     uuid := gen_random_uuid();
  liam_id       uuid := gen_random_uuid();

  -- Horses
  biscuit_id    uuid := gen_random_uuid();
  moose_id      uuid := gen_random_uuid();
  stryker_id    uuid := gen_random_uuid();
  lady_id       uuid := gen_random_uuid();
  duke_id       uuid := gen_random_uuid();

  -- Quarter + subscription IDs (for lesson generation)
  summer_id     uuid;
  summer_start  date;
  summer_end    date;

  emma_sub_id   uuid := gen_random_uuid();
  sofia_sub_id  uuid := gen_random_uuid();
  jake_sub_id   uuid := gen_random_uuid();
  olivia_sub_id uuid := gen_random_uuid();
  liam_sub_id   uuid := gen_random_uuid();

BEGIN
  -- Fetch the Summer 2026 quarter bounds
  SELECT id, start_date, end_date INTO summer_id, summer_start, summer_end
  FROM quarter WHERE label = 'Summer 2026';

  -- --------------------------------------------------------
  -- PEOPLE
  -- --------------------------------------------------------

  -- Instructors
  INSERT INTO person (id, first_name, last_name, email, phone) VALUES
    (paul_id,  'TEST Paul',  'Foster', 'test.paul@example.com',  '555-0101'),
    (maria_id, 'TEST Maria', 'Santos', 'test.maria@example.com', '555-0102');

  -- Training ride provider (rate stays at default $0 — will be set via Billing UI later)
  INSERT INTO person (id, first_name, last_name, email, phone, is_training_ride_provider) VALUES
    (chris_id, 'TEST Chris', 'Walker', 'test.chris@example.com', '555-0103', true);

  -- Barn worker
  INSERT INTO person (id, first_name, last_name, email, phone) VALUES
    (alex_id, 'TEST Alex', 'Miller', 'test.alex@example.com', '555-0104');

  -- Guardian (not a rider, just Sofia's parent)
  INSERT INTO person (id, first_name, last_name, email, phone) VALUES
    (rachel_id, 'TEST Rachel', 'Chen', 'test.rachel@example.com', '555-0201');

  -- Riders
  INSERT INTO person (id, first_name, last_name, email, phone, riding_level) VALUES
    (emma_id,   'TEST Emma',   'Rodriguez', 'test.emma@example.com',   '555-0301', 'intermediate'),
    (olivia_id, 'TEST Olivia', 'Morgan',    'test.olivia@example.com', '555-0302', 'advanced'),
    (jake_id,   'TEST Jake',   'Patel',     'test.jake@example.com',   '555-0303', 'intermediate'),
    (liam_id,   'TEST Liam',   'Thompson',  'test.liam@example.com',   '555-0304', 'beginner');

  -- Minor (uses guardian's contact info)
  INSERT INTO person (id, first_name, last_name, is_minor, guardian_id, riding_level, date_of_birth) VALUES
    (sofia_id, 'TEST Sofia', 'Chen', true, rachel_id, 'beginner', '2012-03-15');

  -- --------------------------------------------------------
  -- PERSON ROLES
  -- --------------------------------------------------------

  INSERT INTO person_role (person_id, role) VALUES
    (paul_id,     'instructor'),
    (maria_id,    'instructor'),
    (chris_id,    'service_provider'),
    (alex_id,     'barn_worker'),
    (emma_id,     'rider'), (emma_id,   'boarder'),
    (olivia_id,   'rider'), (olivia_id, 'boarder'),
    (jake_id,     'rider'),
    (liam_id,     'rider'),
    (sofia_id,    'rider');

  -- --------------------------------------------------------
  -- HORSES
  -- --------------------------------------------------------

  INSERT INTO horse (id, barn_name, registered_name, status, lesson_horse, breed, gender, color, height) VALUES
    (biscuit_id, 'TEST Biscuit', NULL,                 'active', true,  'Quarter Horse',   'Gelding', 'Chestnut', 15.2),
    (moose_id,   'TEST Moose',   'Midnight Majesty',   'active', true,  'Warmblood',       'Gelding', 'Bay',      16.1),
    (stryker_id, 'TEST Stryker', NULL,                 'active', true,  'Thoroughbred',    'Gelding', 'Dark Bay', 16.2),
    (lady_id,    'TEST Lady',    'Lady of the Lake',   'active', false, 'Warmblood',       'Mare',    'Grey',     16.0),
    (duke_id,    'TEST Duke',    NULL,                 'active', false, 'Hanoverian',      'Gelding', 'Black',    17.0);

  -- --------------------------------------------------------
  -- HORSE CONTACTS (ownership links for boarders)
  -- --------------------------------------------------------

  INSERT INTO horse_contact (person_id, horse_id, role, is_billing_contact) VALUES
    (emma_id,   lady_id, 'owner', true),
    (olivia_id, duke_id, 'owner', true);

  -- --------------------------------------------------------
  -- LESSON SUBSCRIPTIONS (Summer 2026)
  -- --------------------------------------------------------

  INSERT INTO lesson_subscription (
    id, rider_id, billed_to_id, quarter_id, lesson_day, lesson_time, instructor_id,
    default_horse_id, subscription_price, subscription_type, status, created_by
  ) VALUES
    -- Emma (boarder, her own horse Lady, Tuesdays 4pm with Paul)
    (emma_sub_id, emma_id, emma_id, summer_id, 'tuesday', '16:00', paul_id, lady_id,
     900.00, 'boarder', 'active', paul_id),

    -- Sofia (minor, billed to Rachel, Wednesdays 3pm with Paul, on Biscuit)
    (sofia_sub_id, sofia_id, rachel_id, summer_id, 'wednesday', '15:00', paul_id, biscuit_id,
     900.00, 'standard', 'active', paul_id),

    -- Jake (Thursdays 5pm with Maria, on Moose)
    (jake_sub_id, jake_id, jake_id, summer_id, 'thursday', '17:00', maria_id, moose_id,
     900.00, 'standard', 'active', maria_id),

    -- Olivia (boarder, her own horse Duke, Tuesdays 6pm with Paul)
    (olivia_sub_id, olivia_id, olivia_id, summer_id, 'tuesday', '18:00', paul_id, duke_id,
     900.00, 'boarder', 'active', paul_id),

    -- Liam (Saturdays 10am with Maria, on Stryker)
    (liam_sub_id, liam_id, liam_id, summer_id, 'saturday', '10:00', maria_id, stryker_id,
     900.00, 'standard', 'active', maria_id);

  -- --------------------------------------------------------
  -- LESSONS — generated from subscriptions × barn_calendar_day
  -- --------------------------------------------------------
  -- PostgreSQL: extract(dow from date): 0=Sunday, 1=Monday .. 6=Saturday

  -- Emma — Tuesdays 4pm
  WITH new_lessons AS (
    INSERT INTO lesson (instructor_id, lesson_type, scheduled_at, status, created_by)
    SELECT paul_id, 'private',
           (date + time '16:00')::timestamp at time zone 'UTC',
           'scheduled', paul_id
    FROM barn_calendar_day
    WHERE quarter_id = summer_id
      AND NOT barn_closed
      AND NOT is_makeup_day
      AND extract(dow from date) = 2
    ORDER BY date
    LIMIT 12
    RETURNING id
  )
  INSERT INTO lesson_rider (lesson_id, rider_id, horse_id, subscription_id)
  SELECT id, emma_id, lady_id, emma_sub_id FROM new_lessons;

  -- Sofia — Wednesdays 3pm
  WITH new_lessons AS (
    INSERT INTO lesson (instructor_id, lesson_type, scheduled_at, status, created_by)
    SELECT paul_id, 'private',
           (date + time '15:00')::timestamp at time zone 'UTC',
           'scheduled', paul_id
    FROM barn_calendar_day
    WHERE quarter_id = summer_id
      AND NOT barn_closed
      AND NOT is_makeup_day
      AND extract(dow from date) = 3
    ORDER BY date
    LIMIT 12
    RETURNING id
  )
  INSERT INTO lesson_rider (lesson_id, rider_id, horse_id, subscription_id)
  SELECT id, sofia_id, biscuit_id, sofia_sub_id FROM new_lessons;

  -- Jake — Thursdays 5pm
  WITH new_lessons AS (
    INSERT INTO lesson (instructor_id, lesson_type, scheduled_at, status, created_by)
    SELECT maria_id, 'private',
           (date + time '17:00')::timestamp at time zone 'UTC',
           'scheduled', maria_id
    FROM barn_calendar_day
    WHERE quarter_id = summer_id
      AND NOT barn_closed
      AND NOT is_makeup_day
      AND extract(dow from date) = 4
    ORDER BY date
    LIMIT 12
    RETURNING id
  )
  INSERT INTO lesson_rider (lesson_id, rider_id, horse_id, subscription_id)
  SELECT id, jake_id, moose_id, jake_sub_id FROM new_lessons;

  -- Olivia — Tuesdays 6pm
  WITH new_lessons AS (
    INSERT INTO lesson (instructor_id, lesson_type, scheduled_at, status, created_by)
    SELECT paul_id, 'private',
           (date + time '18:00')::timestamp at time zone 'UTC',
           'scheduled', paul_id
    FROM barn_calendar_day
    WHERE quarter_id = summer_id
      AND NOT barn_closed
      AND NOT is_makeup_day
      AND extract(dow from date) = 2
    ORDER BY date
    LIMIT 12
    RETURNING id
  )
  INSERT INTO lesson_rider (lesson_id, rider_id, horse_id, subscription_id)
  SELECT id, olivia_id, duke_id, olivia_sub_id FROM new_lessons;

  -- Liam — Saturdays 10am
  WITH new_lessons AS (
    INSERT INTO lesson (instructor_id, lesson_type, scheduled_at, status, created_by)
    SELECT maria_id, 'private',
           (date + time '10:00')::timestamp at time zone 'UTC',
           'scheduled', maria_id
    FROM barn_calendar_day
    WHERE quarter_id = summer_id
      AND NOT barn_closed
      AND NOT is_makeup_day
      AND extract(dow from date) = 6
    ORDER BY date
    LIMIT 12
    RETURNING id
  )
  INSERT INTO lesson_rider (lesson_id, rider_id, horse_id, subscription_id)
  SELECT id, liam_id, stryker_id, liam_sub_id FROM new_lessons;

  -- --------------------------------------------------------
  -- TRAINING RIDES — a few for Chris on Stryker so the grid has content
  -- Mix of logged (past) and scheduled (upcoming) around today (2026-04-16).
  -- --------------------------------------------------------

  INSERT INTO training_ride (rider_id, horse_id, ride_date, status, unit_price, logged_at, logged_by_id, created_by) VALUES
    -- Logged rides (past) — Stryker becomes "training-active"
    (chris_id, stryker_id, '2026-04-06', 'logged', 0.00, '2026-04-06T18:00:00Z', chris_id, chris_id),
    (chris_id, stryker_id, '2026-04-08', 'logged', 0.00, '2026-04-08T17:30:00Z', chris_id, chris_id),
    (chris_id, stryker_id, '2026-04-10', 'logged', 0.00, '2026-04-10T18:15:00Z', chris_id, chris_id),
    (chris_id, biscuit_id, '2026-04-13', 'logged', 0.00, '2026-04-13T16:00:00Z', chris_id, chris_id),
    (chris_id, stryker_id, '2026-04-13', 'logged', 0.00, '2026-04-13T18:00:00Z', chris_id, chris_id);

  INSERT INTO training_ride (rider_id, horse_id, ride_date, status, unit_price, created_by) VALUES
    -- Scheduled rides this week (Apr 13-19)
    (chris_id, stryker_id, '2026-04-15', 'scheduled', 0.00, chris_id),
    (chris_id, stryker_id, '2026-04-17', 'scheduled', 0.00, chris_id),
    (chris_id, biscuit_id, '2026-04-17', 'scheduled', 0.00, chris_id);

END $$;


-- ============================================================
-- CLEANUP (run this block to nuke all TEST data — DO NOT uncomment here,
-- paste it into the Supabase SQL editor when you want to reset)
-- ============================================================
--
-- DELETE FROM training_ride         WHERE rider_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM lesson_rider          WHERE rider_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM lesson                WHERE instructor_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM lesson_subscription   WHERE rider_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM horse_contact         WHERE person_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM person_role           WHERE person_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM horse                 WHERE barn_name LIKE 'TEST %';
-- UPDATE person SET guardian_id=NULL WHERE guardian_id IN (SELECT id FROM person WHERE first_name LIKE 'TEST %');
-- DELETE FROM person                WHERE first_name LIKE 'TEST %';
