-- Security hardening migration

-- 1. Prevent admin self-escalation to super_admin
-- Replace the existing admin update policy with one that restricts role changes
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) IN ('admin', 'super_admin')
  )
  WITH CHECK (
    -- super_admin role can only be set by existing super_admins
    CASE
      WHEN role = 'super_admin' THEN
        (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) = 'super_admin'
      ELSE true
    END
  );

-- 2. Tighten task_team_links RLS (was fully open to all authenticated)
DROP POLICY IF EXISTS "auth_select" ON task_team_links;
DROP POLICY IF EXISTS "auth_insert" ON task_team_links;
DROP POLICY IF EXISTS "auth_update" ON task_team_links;
DROP POLICY IF EXISTS "auth_delete" ON task_team_links;

CREATE POLICY "auth_select" ON task_team_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_mutate" ON task_team_links
  FOR ALL TO authenticated
  USING (
    is_admin() OR team_id IN (
      SELECT team_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin() OR team_id IN (
      SELECT team_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- 3. Scope avatar uploads to own user file path
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;

CREATE POLICY "Authenticated users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'avatars'
    AND storage.filename(name) LIKE (auth.uid()::text || '.%')
  );

CREATE POLICY "Authenticated users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND storage.filename(name) LIKE (auth.uid()::text || '.%')
  );

-- 4. Fix activity_log INSERT policy to prevent log spoofing
DROP POLICY IF EXISTS "Authenticated can insert activity_log" ON activity_log;

CREATE POLICY "Authenticated can insert own activity_log" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- 5. Add index on notifications.recipient_id for efficient filtering
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_id, created_at DESC);
