-- Absence Approval Workflow Migration
-- Adds super_admin role, absence status workflow, and decision metadata

-- A. Add super_admin to roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'admin', 'user'));

-- B. Update is_admin() to include super_admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('admin', 'super_admin'));
$$;

-- C. Add is_super_admin() function
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'super_admin');
$$;

-- D. Alter absences table: approved boolean → status text + decision metadata
ALTER TABLE absences ADD COLUMN status text CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending';
ALTER TABLE absences ADD COLUMN decided_by UUID REFERENCES profiles(id);
ALTER TABLE absences ADD COLUMN decided_at timestamptz;
ALTER TABLE absences ADD COLUMN decline_reason text;

-- Migrate existing data
UPDATE absences SET status = CASE WHEN approved THEN 'approved' ELSE 'pending' END;

-- Drop old column
ALTER TABLE absences DROP COLUMN approved;

-- Index for filtering by status
CREATE INDEX idx_absences_status ON absences(status);

-- E. Tighten absences RLS
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view all absences" ON absences;
DROP POLICY IF EXISTS "Admins can insert absences" ON absences;
DROP POLICY IF EXISTS "Admins can update absences" ON absences;
DROP POLICY IF EXISTS "Admins can delete absences" ON absences;
DROP POLICY IF EXISTS "Users can insert own absences" ON absences;
DROP POLICY IF EXISTS "Users can update own absences" ON absences;
DROP POLICY IF EXISTS "Users can delete own absences" ON absences;
DROP POLICY IF EXISTS "absences_select" ON absences;
DROP POLICY IF EXISTS "absences_insert" ON absences;
DROP POLICY IF EXISTS "absences_update" ON absences;
DROP POLICY IF EXISTS "absences_delete" ON absences;

-- SELECT: all authenticated users
CREATE POLICY "absences_select" ON absences FOR SELECT TO authenticated USING (true);

-- INSERT: own absences + admins can insert for anyone
CREATE POLICY "absences_insert" ON absences FOR INSERT TO authenticated
  WITH CHECK (
    member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR is_admin()
  );

-- UPDATE: super_admins can update any; users can update own pending absences only
CREATE POLICY "absences_update" ON absences FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND status = 'pending'
    )
  );

-- DELETE: admins can delete any; users can delete own pending only
CREATE POLICY "absences_delete" ON absences FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (
      member_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
      AND status = 'pending'
    )
  );
