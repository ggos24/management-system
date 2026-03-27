-- ============================================================
-- Role Rename: super_admin → admin, admin → editor
-- ============================================================

-- 1. Drop existing CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Migrate data (order matters: admin→editor first, then super_admin→admin)
UPDATE profiles SET role = 'editor' WHERE role = 'admin';
UPDATE profiles SET role = 'admin' WHERE role = 'super_admin';

-- 3. Add new CHECK constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'editor', 'user'));

-- ============================================================
-- Replace helper functions
-- ============================================================

-- is_admin(): strict check — only role = 'admin' (was is_super_admin)
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'admin');
$$;

-- is_editor(): editor or above (was is_admin which checked admin+super_admin)
CREATE OR REPLACE FUNCTION is_editor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('editor', 'admin'));
$$;

-- Drop policies that depend on is_super_admin() BEFORE dropping the function
DROP POLICY IF EXISTS "absences_update" ON absences;

-- Drop the old is_super_admin function
DROP FUNCTION IF EXISTS is_super_admin();

-- ============================================================
-- Update RLS policies that used is_admin() (meant "editor or above")
-- These all need to call is_editor() now
-- ============================================================

-- Tasks
DROP POLICY IF EXISTS "Users manage own team tasks" ON tasks;
CREATE POLICY "Users manage own team tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    is_editor() OR team_id = (SELECT ap.team_id FROM auth_profile() ap)
  );

DROP POLICY IF EXISTS "Users update own team tasks" ON tasks;
CREATE POLICY "Users update own team tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (
    is_editor() OR team_id = (SELECT ap.team_id FROM auth_profile() ap)
  );

DROP POLICY IF EXISTS "Users delete own team tasks" ON tasks;
CREATE POLICY "Users delete own team tasks" ON tasks
  FOR DELETE TO authenticated
  USING (
    is_editor() OR team_id = (SELECT ap.team_id FROM auth_profile() ap)
  );

-- Task assignees
DROP POLICY IF EXISTS "Users manage task_assignees for own team" ON task_assignees;
CREATE POLICY "Users manage task_assignees for own team" ON task_assignees
  FOR ALL TO authenticated
  USING (
    is_editor() OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
      AND t.team_id = (SELECT ap.team_id FROM auth_profile() ap)
    )
  );

-- Task placements
DROP POLICY IF EXISTS "Users manage task_placements for own team" ON task_placements;
CREATE POLICY "Users manage task_placements for own team" ON task_placements
  FOR ALL TO authenticated
  USING (
    is_editor() OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_placements.task_id
      AND t.team_id = (SELECT ap.team_id FROM auth_profile() ap)
    )
  );

-- Absences: users manage own, editors+ manage any
DROP POLICY IF EXISTS "Users manage own absences" ON absences;
DROP POLICY IF EXISTS "absences_insert" ON absences;
CREATE POLICY "absences_insert" ON absences FOR INSERT TO authenticated
  WITH CHECK (
    member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_editor()
  );

DROP POLICY IF EXISTS "Users update own absences" ON absences;
DROP POLICY IF EXISTS "absences_update" ON absences;
CREATE POLICY "absences_update" ON absences FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (
      member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND status = 'pending'
    )
  );

DROP POLICY IF EXISTS "Users delete own absences" ON absences;
DROP POLICY IF EXISTS "absences_delete" ON absences;
CREATE POLICY "absences_delete" ON absences FOR DELETE TO authenticated
  USING (
    is_editor()
    OR (
      member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND status = 'pending'
    )
  );

-- Shifts: editor+ only (users can no longer self-manage shifts)
DROP POLICY IF EXISTS "Users manage own shifts" ON shifts;
DROP POLICY IF EXISTS "Users update own shifts" ON shifts;
DROP POLICY IF EXISTS "Users delete own shifts" ON shifts;

CREATE POLICY "Editors manage shifts" ON shifts
  FOR INSERT TO authenticated
  WITH CHECK (is_editor());

CREATE POLICY "Editors update shifts" ON shifts
  FOR UPDATE TO authenticated
  USING (is_editor());

CREATE POLICY "Editors delete shifts" ON shifts
  FOR DELETE TO authenticated
  USING (is_editor());

-- Teams: editor+ mutations (editors can rename, admins can create/delete)
DROP POLICY IF EXISTS "Admins manage teams" ON teams;
CREATE POLICY "Editors manage teams" ON teams
  FOR ALL TO authenticated
  USING (is_editor())
  WITH CHECK (is_editor());

-- Team statuses: editor+ mutations
DROP POLICY IF EXISTS "Admins manage team_statuses" ON team_statuses;
CREATE POLICY "Editors manage team_statuses" ON team_statuses
  FOR ALL TO authenticated
  USING (is_editor())
  WITH CHECK (is_editor());

-- Team content types: editor+ mutations
DROP POLICY IF EXISTS "Admins manage team_content_types" ON team_content_types;
CREATE POLICY "Editors manage team_content_types" ON team_content_types
  FOR ALL TO authenticated
  USING (is_editor())
  WITH CHECK (is_editor());

-- Custom properties: editor+ mutations
DROP POLICY IF EXISTS "Admins manage custom_properties" ON custom_properties;
CREATE POLICY "Editors manage custom_properties" ON custom_properties
  FOR ALL TO authenticated
  USING (is_editor())
  WITH CHECK (is_editor());

-- Permissions: editor+ mutations
DROP POLICY IF EXISTS "Admins manage permissions" ON permissions;
CREATE POLICY "Editors manage permissions" ON permissions
  FOR ALL TO authenticated
  USING (is_editor())
  WITH CHECK (is_editor());

-- Placements: editor+ mutations
DROP POLICY IF EXISTS "Admins manage placements" ON placements;
DROP POLICY IF EXISTS "Admins delete placements" ON placements;
CREATE POLICY "Editors manage placements" ON placements
  FOR UPDATE TO authenticated
  USING (is_editor());

CREATE POLICY "Editors delete placements" ON placements
  FOR DELETE TO authenticated
  USING (is_editor());

-- App settings: admin-only mutations
DROP POLICY IF EXISTS "Admins manage app_settings" ON app_settings;
CREATE POLICY "Admins manage app_settings" ON app_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Profiles: admin-only insert/delete
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles" ON profiles
  FOR DELETE TO authenticated
  USING (is_admin());

-- Profiles: update — editors+ can update, but only admins can set admin role
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Editors can update profiles" ON profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) IN ('editor', 'admin')
    OR id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    CASE
      WHEN role = 'admin' THEN
        (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) = 'admin'
      ELSE true
    END
  );

-- Task comments: editor+ can edit/delete any, users can manage own
DROP POLICY IF EXISTS "Users can update own task_comments" ON task_comments;
CREATE POLICY "Users can update own task_comments" ON task_comments
  FOR UPDATE TO authenticated
  USING (is_editor() OR user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own task_comments" ON task_comments;
CREATE POLICY "Users can delete own task_comments" ON task_comments
  FOR DELETE TO authenticated
  USING (is_admin() OR user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Docs: admin-only mutations
DROP POLICY IF EXISTS docs_insert ON docs;
DROP POLICY IF EXISTS docs_update ON docs;
DROP POLICY IF EXISTS docs_delete ON docs;
CREATE POLICY docs_insert ON docs FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY docs_update ON docs FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY docs_delete ON docs FOR DELETE TO authenticated USING (is_admin());

-- Docs assets storage: admin-only delete
DROP POLICY IF EXISTS "Admins can delete doc assets" ON storage.objects;
CREATE POLICY "Admins can delete doc assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'docs-assets' AND is_admin());

-- Task team links
DROP POLICY IF EXISTS "auth_mutate" ON task_team_links;
CREATE POLICY "auth_mutate" ON task_team_links
  FOR ALL TO authenticated
  USING (
    is_editor() OR team_id IN (
      SELECT team_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_editor() OR team_id IN (
      SELECT team_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );
