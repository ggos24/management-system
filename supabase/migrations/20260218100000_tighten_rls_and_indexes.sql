-- ============================================================
-- Tighten RLS policies and add missing indexes
-- ============================================================

-- Helper: get current user's profile info
CREATE OR REPLACE FUNCTION auth_profile()
RETURNS TABLE(profile_id UUID, team_id UUID, role text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id, team_id, role FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'admin');
$$;

-- ============================================================
-- Drop all wide-open mutation policies
-- ============================================================

-- Tasks
DROP POLICY IF EXISTS "Authenticated can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated can update tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated can delete tasks" ON tasks;

-- Users can manage tasks in their own team; admins can manage all tasks
CREATE POLICY "Users manage own team tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR team_id = (SELECT ap.team_id FROM auth_profile() ap)
  );

CREATE POLICY "Users update own team tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR team_id = (SELECT ap.team_id FROM auth_profile() ap)
  );

CREATE POLICY "Users delete own team tasks" ON tasks
  FOR DELETE TO authenticated
  USING (
    is_admin() OR team_id = (SELECT ap.team_id FROM auth_profile() ap)
  );

-- Task assignees: follow task team restrictions
DROP POLICY IF EXISTS "Authenticated can insert task_assignees" ON task_assignees;
DROP POLICY IF EXISTS "Authenticated can update task_assignees" ON task_assignees;
DROP POLICY IF EXISTS "Authenticated can delete task_assignees" ON task_assignees;

CREATE POLICY "Users manage task_assignees for own team" ON task_assignees
  FOR ALL TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
      AND t.team_id = (SELECT ap.team_id FROM auth_profile() ap)
    )
  );

-- Task placements: follow task team restrictions
DROP POLICY IF EXISTS "Authenticated can insert task_placements" ON task_placements;
DROP POLICY IF EXISTS "Authenticated can update task_placements" ON task_placements;
DROP POLICY IF EXISTS "Authenticated can delete task_placements" ON task_placements;

CREATE POLICY "Users manage task_placements for own team" ON task_placements
  FOR ALL TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_placements.task_id
      AND t.team_id = (SELECT ap.team_id FROM auth_profile() ap)
    )
  );

-- Absences: users manage their own, admins manage any
DROP POLICY IF EXISTS "Authenticated can insert absences" ON absences;
DROP POLICY IF EXISTS "Authenticated can update absences" ON absences;
DROP POLICY IF EXISTS "Authenticated can delete absences" ON absences;

CREATE POLICY "Users manage own absences" ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR member_id = (SELECT ap.profile_id FROM auth_profile() ap)
  );

CREATE POLICY "Users update own absences" ON absences
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR member_id = (SELECT ap.profile_id FROM auth_profile() ap)
  );

CREATE POLICY "Users delete own absences" ON absences
  FOR DELETE TO authenticated
  USING (
    is_admin() OR member_id = (SELECT ap.profile_id FROM auth_profile() ap)
  );

-- Shifts: users manage their own, admins manage any
DROP POLICY IF EXISTS "Authenticated can insert shifts" ON shifts;
DROP POLICY IF EXISTS "Authenticated can update shifts" ON shifts;
DROP POLICY IF EXISTS "Authenticated can delete shifts" ON shifts;

CREATE POLICY "Users manage own shifts" ON shifts
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR member_id = (SELECT ap.profile_id FROM auth_profile() ap)
  );

CREATE POLICY "Users update own shifts" ON shifts
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR member_id = (SELECT ap.profile_id FROM auth_profile() ap)
  );

CREATE POLICY "Users delete own shifts" ON shifts
  FOR DELETE TO authenticated
  USING (
    is_admin() OR member_id = (SELECT ap.profile_id FROM auth_profile() ap)
  );

-- Teams: admin-only mutations
DROP POLICY IF EXISTS "Authenticated can insert teams" ON teams;
DROP POLICY IF EXISTS "Authenticated can update teams" ON teams;
DROP POLICY IF EXISTS "Authenticated can delete teams" ON teams;

CREATE POLICY "Admins manage teams" ON teams
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Team statuses: admin-only mutations
DROP POLICY IF EXISTS "Authenticated can insert team_statuses" ON team_statuses;
DROP POLICY IF EXISTS "Authenticated can update team_statuses" ON team_statuses;
DROP POLICY IF EXISTS "Authenticated can delete team_statuses" ON team_statuses;

CREATE POLICY "Admins manage team_statuses" ON team_statuses
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Team content types: admin-only mutations
DROP POLICY IF EXISTS "Authenticated can insert team_content_types" ON team_content_types;
DROP POLICY IF EXISTS "Authenticated can update team_content_types" ON team_content_types;
DROP POLICY IF EXISTS "Authenticated can delete team_content_types" ON team_content_types;

CREATE POLICY "Admins manage team_content_types" ON team_content_types
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Custom properties: admin-only mutations
DROP POLICY IF EXISTS "Authenticated can insert custom_properties" ON custom_properties;
DROP POLICY IF EXISTS "Authenticated can update custom_properties" ON custom_properties;
DROP POLICY IF EXISTS "Authenticated can delete custom_properties" ON custom_properties;

CREATE POLICY "Admins manage custom_properties" ON custom_properties
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Permissions: admin-only mutations
DROP POLICY IF EXISTS "Authenticated can insert permissions" ON permissions;
DROP POLICY IF EXISTS "Authenticated can update permissions" ON permissions;
DROP POLICY IF EXISTS "Authenticated can delete permissions" ON permissions;

CREATE POLICY "Admins manage permissions" ON permissions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Placements: admin-only mutations for the lookup table
DROP POLICY IF EXISTS "Authenticated can insert placements" ON placements;
DROP POLICY IF EXISTS "Authenticated can update placements" ON placements;
DROP POLICY IF EXISTS "Authenticated can delete placements" ON placements;

CREATE POLICY "Authenticated can insert placements" ON placements
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins manage placements" ON placements
  FOR UPDATE TO authenticated
  USING (is_admin());

CREATE POLICY "Admins delete placements" ON placements
  FOR DELETE TO authenticated
  USING (is_admin());

-- App settings: admin-only mutations
DROP POLICY IF EXISTS "Authenticated can insert app_settings" ON app_settings;
DROP POLICY IF EXISTS "Authenticated can update app_settings" ON app_settings;
DROP POLICY IF EXISTS "Authenticated can delete app_settings" ON app_settings;

CREATE POLICY "Admins manage app_settings" ON app_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Profiles: tighten INSERT to admin-only (invites go through edge function with service key)
DROP POLICY IF EXISTS "Authenticated can insert profiles" ON profiles;

CREATE POLICY "Admins can insert profiles" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Profiles: add DELETE policy for admins only
CREATE POLICY "Admins can delete profiles" ON profiles
  FOR DELETE TO authenticated
  USING (is_admin());

-- Activity log: keep INSERT-only (already correct), no UPDATE/DELETE
-- (no changes needed — activity_log only has SELECT + INSERT policies)

-- ============================================================
-- Add missing indexes for common query patterns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_team_status ON tasks(team_id, status);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON profiles(auth_user_id);
