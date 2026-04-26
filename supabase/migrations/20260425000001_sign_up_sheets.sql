-- Service sign-up sheets for visiting providers (Dr. Ruth chiro, vaccine days,
-- sheath cleaners, clippers). Replaces the physical sheet posted in the barn so
-- boarders who aren't there can sign up and see the roster remotely.
--
-- Design lives in docs/requirements/sign-up-sheets.md. Key constraints:
--
--   * A sheet is anchored to an existing (provider, service) provider_qr_code
--     row. No QR → no sheet. (Enforced at the form layer; admin-only writes.)
--   * Two modes: timed (start_time + duration per slot, surfaces on iCal at
--     real clock time) and ordered (position only, all-day iCal event).
--   * One horse per slot. One note per slot. Notes visible to everyone with
--     access to the sheet.
--   * Day-after archive is implicit: UI only surfaces sheets where date >=
--     today. No closed_at, no archived_at.

CREATE TABLE sign_up_sheet (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_person_id   uuid NOT NULL REFERENCES person(id),
  service_id           uuid NOT NULL REFERENCES board_service(id),
  date                 date NOT NULL,
  mode                 text NOT NULL CHECK (mode IN ('timed', 'ordered')),
  title                text NOT NULL,
  description          text,
  created_by_id        uuid REFERENCES person(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

-- "Any sheet for this provider on this date" — used by /p/[token] to detect
-- whether to show a roster on top of the service-logging UI.
CREATE INDEX sign_up_sheet_provider_date_idx
  ON sign_up_sheet(provider_person_id, date)
  WHERE deleted_at IS NULL;

-- Active-sheets lookup ("any sheet today or later") for boarder tab visibility
-- and admin list view.
CREATE INDEX sign_up_sheet_date_idx
  ON sign_up_sheet(date)
  WHERE deleted_at IS NULL;


CREATE TABLE sign_up_sheet_slot (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id          uuid NOT NULL REFERENCES sign_up_sheet(id) ON DELETE CASCADE,
  position          int NOT NULL,

  -- Timed-mode fields (null when sheet.mode = 'ordered').
  start_time        time,
  duration_minutes  int,

  -- Slot occupancy. All three move together: when a slot is claimed, all are
  -- set; when released, all are cleared.
  horse_id          uuid REFERENCES horse(id),
  signed_up_by_id   uuid REFERENCES person(id),
  signed_up_at      timestamptz,

  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (sheet_id, position),

  -- Occupancy fields are all-or-nothing. Notes are independent.
  CONSTRAINT sign_up_slot_occupancy_consistent CHECK (
    (horse_id IS NULL AND signed_up_by_id IS NULL AND signed_up_at IS NULL)
    OR
    (horse_id IS NOT NULL AND signed_up_by_id IS NOT NULL AND signed_up_at IS NOT NULL)
  ),

  -- Timed-mode slot fields are all-or-nothing too. Mode-vs-fields agreement
  -- is enforced at the application layer (we'd need a subquery trigger to do
  -- it here and the create-form is the only writer).
  CONSTRAINT sign_up_slot_timed_fields_consistent CHECK (
    (start_time IS NULL AND duration_minutes IS NULL)
    OR
    (start_time IS NOT NULL AND duration_minutes IS NOT NULL AND duration_minutes > 0)
  )
);

-- "All slots a boarder's horse is on" — used by My Schedule and iCal feed.
CREATE INDEX sign_up_sheet_slot_horse_idx
  ON sign_up_sheet_slot(horse_id)
  WHERE horse_id IS NOT NULL;


-- ============================================================
-- RLS
-- ============================================================
-- Read: any authenticated user can see all sheets and slots. Full visibility
-- is the feature — boarders read the roster + notes the same way they'd read
-- the paper sheet posted in the barn. Provider QR access goes through the
-- existing /p/[token] surface (no auth.uid()), so reads from that path use
-- createAdminClient() and bypass RLS by design.
--
-- Write: admin-only at the policy layer. Boarder slot claims happen via
-- server actions that run with createAdminClient() after verifying auth +
-- horse_contact. Same pattern as /my/training-rides.

ALTER TABLE sign_up_sheet ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_up_sheet_slot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sign_up_sheet: authenticated read"
  ON sign_up_sheet FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "sign_up_sheet: admin write"
  ON sign_up_sheet FOR ALL
  USING (is_admin());

CREATE POLICY "sign_up_sheet_slot: authenticated read"
  ON sign_up_sheet_slot FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "sign_up_sheet_slot: admin write"
  ON sign_up_sheet_slot FOR ALL
  USING (is_admin());
