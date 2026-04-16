-- ============================================================
-- RLS Helper Functions and Initial Auth Policies
-- Migration: 20260415000001
-- ============================================================
-- These functions are the foundation for all RLS policies.
-- They are SECURITY DEFINER so they run with elevated privileges
-- and can query person/person_role tables regardless of caller's RLS.
-- ============================================================

-- Returns the person.id for the currently authenticated user.
-- Returns null if no matching Person record exists.
CREATE OR REPLACE FUNCTION auth_person_id()
RETURNS uuid AS $$
  SELECT id
  FROM person
  WHERE auth_user_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true if the current user holds admin or barn_owner role.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM person_role pr
    WHERE pr.person_id = auth_person_id()
      AND pr.role IN ('admin', 'barn_owner')
      AND pr.deleted_at IS NULL
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true if current user is staff or a contractor.
-- Staff = admin, barn_owner, instructor, barn_worker, or training_ride_provider.
-- Staff get full read access to all active horse records (safety rule).
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean AS $$
  SELECT
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM person_role pr
      WHERE pr.person_id = auth_person_id()
        AND pr.role IN ('instructor', 'barn_worker')
        AND pr.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM person p
      WHERE p.id = auth_person_id()
        AND p.is_training_ride_provider = true
        AND p.deleted_at IS NULL
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true if the current user has the given role.
CREATE OR REPLACE FUNCTION has_role(check_role person_role_type)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM person_role pr
    WHERE pr.person_id = auth_person_id()
      AND pr.role = check_role
      AND pr.deleted_at IS NULL
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- PERSON POLICIES
-- ============================================================

-- Anyone authenticated can read their own Person record.
CREATE POLICY "person: read own record"
  ON person FOR SELECT
  USING (auth_user_id = auth.uid());

-- Admins can read all person records.
CREATE POLICY "person: admin read all"
  ON person FOR SELECT
  USING (is_admin());

-- Admins can insert new person records.
CREATE POLICY "person: admin insert"
  ON person FOR INSERT
  WITH CHECK (is_admin());

-- Admins can update person records.
CREATE POLICY "person: admin update"
  ON person FOR UPDATE
  USING (is_admin());

-- Anyone can update their own non-sensitive fields
-- (email, phone, address, preferred_language, preferred_name).
-- Sensitive fields (roles, auth_user_id, etc.) are admin-only at application layer.
CREATE POLICY "person: update own record"
  ON person FOR UPDATE
  USING (auth_user_id = auth.uid());


-- ============================================================
-- PERSON ROLE POLICIES
-- ============================================================

-- Anyone can read their own roles (needed for role-based rendering).
CREATE POLICY "person_role: read own"
  ON person_role FOR SELECT
  USING (person_id = auth_person_id());

-- Admins can read all roles.
CREATE POLICY "person_role: admin read all"
  ON person_role FOR SELECT
  USING (is_admin());

-- Admins can manage roles.
CREATE POLICY "person_role: admin insert"
  ON person_role FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "person_role: admin update"
  ON person_role FOR UPDATE
  USING (is_admin());


-- ============================================================
-- NOTIFICATION PREFERENCE POLICIES
-- ============================================================

-- Users can manage their own notification preferences.
CREATE POLICY "notification_preference: manage own"
  ON notification_preference FOR ALL
  USING (person_id = auth_person_id());

-- Admins can manage all notification preferences.
CREATE POLICY "notification_preference: admin all"
  ON notification_preference FOR ALL
  USING (is_admin());


-- ============================================================
-- QUARTER + BARN CALENDAR DAY — read-only for all authenticated users
-- ============================================================

CREATE POLICY "quarter: authenticated read"
  ON quarter FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "quarter: admin write"
  ON quarter FOR ALL
  USING (is_admin());

CREATE POLICY "barn_calendar_day: authenticated read"
  ON barn_calendar_day FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "barn_calendar_day: admin write"
  ON barn_calendar_day FOR ALL
  USING (is_admin());


-- ============================================================
-- BOARD SERVICE CATALOG — read-only for authenticated, admin writes
-- ============================================================

CREATE POLICY "board_service: authenticated read"
  ON board_service FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "board_service: admin write"
  ON board_service FOR ALL
  USING (is_admin());


-- ============================================================
-- HEALTH ITEM TYPE CATALOG — read-only for authenticated, admin writes
-- ============================================================

CREATE POLICY "health_item_type: authenticated read"
  ON health_item_type FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "health_item_type: admin write"
  ON health_item_type FOR ALL
  USING (is_admin());


-- ============================================================
-- CUSTOM FIELD DEFINITION — read-only for authenticated, admin writes
-- ============================================================

CREATE POLICY "custom_field_definition: authenticated read"
  ON custom_field_definition FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "custom_field_definition: admin write"
  ON custom_field_definition FOR ALL
  USING (is_admin());
