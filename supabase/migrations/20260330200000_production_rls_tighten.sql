-- Production RLS tightening: restrict overly permissive policies
-- These changes only block actions that shouldn't be happening — no legitimate user behavior is affected.

-- 1a. team_placements: was open to all authenticated, restrict to editor+
DROP POLICY IF EXISTS "auth_insert" ON team_placements;
DROP POLICY IF EXISTS "auth_update" ON team_placements;
DROP POLICY IF EXISTS "auth_delete" ON team_placements;

CREATE POLICY "Editors manage team_placements" ON team_placements
  FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "Editors update team_placements" ON team_placements
  FOR UPDATE TO authenticated USING (is_editor());
CREATE POLICY "Editors delete team_placements" ON team_placements
  FOR DELETE TO authenticated USING (is_editor());

-- 1b. placements INSERT: was open to all authenticated, restrict to editor+
DROP POLICY IF EXISTS "Authenticated can insert placements" ON placements;
CREATE POLICY "Editors insert placements" ON placements
  FOR INSERT TO authenticated WITH CHECK (is_editor());

-- 1c. notifications INSERT: enforce actor_id = caller's own profile
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
CREATE POLICY "Users insert own notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- 1d. absences UPDATE: add WITH CHECK so non-admins cannot change status to approved/declined
DROP POLICY IF EXISTS "absences_update" ON absences;
CREATE POLICY "absences_update" ON absences FOR UPDATE TO authenticated
  USING (
    is_admin() OR (
      member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND status = 'pending'
    )
  )
  WITH CHECK (
    is_admin() OR (status = 'pending' AND decided_by IS NULL)
  );

-- 1e. avatars: drop old permissive INSERT policy that was never cleaned up
-- The hardening migration created a new scoped policy but the original still exists;
-- since Postgres ORs permissive policies, the old one makes the new one ineffective.
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;

-- 1f. docs-assets INSERT: was open to all authenticated, restrict to editor+
DROP POLICY IF EXISTS "Authenticated users can upload doc assets" ON storage.objects;
CREATE POLICY "Editors can upload doc assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'docs-assets' AND is_editor());
