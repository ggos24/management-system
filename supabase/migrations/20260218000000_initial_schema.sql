-- ============================================================
-- Initial schema migration for Management System
-- ============================================================

-- ===================
-- 1. Tables
-- ===================

-- profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id),
  name text NOT NULL,
  role text CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  job_title text,
  avatar text,
  team_id UUID,
  status text CHECK (status IN ('active', 'sick', 'vacation', 'remote')) DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  schedule_type text CHECK (schedule_type IN ('absence-only', 'shift-based')) DEFAULT 'shift-based',
  hidden boolean DEFAULT false,
  archived boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add FK from profiles.team_id → teams.id
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_team FOREIGN KEY (team_id) REFERENCES teams(id);

-- tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  team_id UUID NOT NULL REFERENCES teams(id),
  status text NOT NULL,
  priority text CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  due_date date,
  content_type text,
  notes text,
  editor_ids JSONB DEFAULT '[]',
  designer_ids JSONB DEFAULT '[]',
  links JSONB DEFAULT '[]',
  files JSONB DEFAULT '[]',
  custom_field_values JSONB DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- task_assignees (junction)
CREATE TABLE task_assignees (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sort_order int DEFAULT 0,
  PRIMARY KEY (task_id, member_id)
);

-- placements
CREATE TABLE placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  category text,
  sort_order int DEFAULT 0
);

-- task_placements (junction)
CREATE TABLE task_placements (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  placement_id UUID REFERENCES placements(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, placement_id)
);

-- team_statuses
CREATE TABLE team_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  category text CHECK (category IN ('active', 'completed', 'ignored')) DEFAULT 'active',
  is_archived boolean DEFAULT false,
  UNIQUE(team_id, name)
);

-- team_content_types
CREATE TABLE team_content_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  UNIQUE(team_id, name)
);

-- custom_properties
CREATE TABLE custom_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name text,
  type text CHECK (type IN ('text', 'date', 'select', 'multiselect', 'person')),
  options JSONB DEFAULT '[]'
);

-- absences
CREATE TABLE absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text CHECK (type IN ('holiday', 'sick', 'business_trip', 'day_off')),
  start_date date,
  end_date date,
  approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- shifts
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date,
  start_time time,
  end_time time,
  created_at timestamptz DEFAULT now()
);

-- permissions
CREATE TABLE permissions (
  member_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  can_create boolean DEFAULT true,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false
);

-- activity_log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details text,
  timestamp timestamptz DEFAULT now()
);

-- app_settings (single-row)
CREATE TABLE app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  integrations JSONB DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- ===================
-- 2. Row Level Security
-- ===================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- SELECT for all authenticated users on all tables
CREATE POLICY "Authenticated can select profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select teams" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select tasks" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select task_assignees" ON task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select placements" ON placements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select task_placements" ON task_placements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select team_statuses" ON team_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select team_content_types" ON team_content_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select custom_properties" ON custom_properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select absences" ON absences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select shifts" ON shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select permissions" ON permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select activity_log" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can select app_settings" ON app_settings FOR SELECT TO authenticated USING (true);

-- profiles: special UPDATE policies
CREATE POLICY "Authenticated users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) = 'admin'
  );

CREATE POLICY "Authenticated can insert profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (true);

-- activity_log: INSERT only (immutable audit trail)
CREATE POLICY "Authenticated can insert activity_log" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- All other tables: full INSERT, UPDATE, DELETE for authenticated
CREATE POLICY "Authenticated can insert teams" ON teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update teams" ON teams FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete teams" ON teams FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tasks" ON tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete tasks" ON tasks FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert task_assignees" ON task_assignees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update task_assignees" ON task_assignees FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete task_assignees" ON task_assignees FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert placements" ON placements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update placements" ON placements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete placements" ON placements FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert task_placements" ON task_placements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update task_placements" ON task_placements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete task_placements" ON task_placements FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert team_statuses" ON team_statuses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update team_statuses" ON team_statuses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete team_statuses" ON team_statuses FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert team_content_types" ON team_content_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update team_content_types" ON team_content_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete team_content_types" ON team_content_types FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert custom_properties" ON custom_properties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update custom_properties" ON custom_properties FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete custom_properties" ON custom_properties FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert absences" ON absences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update absences" ON absences FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete absences" ON absences FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert shifts" ON shifts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shifts" ON shifts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete shifts" ON shifts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert permissions" ON permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update permissions" ON permissions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete permissions" ON permissions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert app_settings" ON app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update app_settings" ON app_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete app_settings" ON app_settings FOR DELETE TO authenticated USING (true);

-- ===================
-- 3. Indexes
-- ===================

CREATE INDEX idx_task_assignees_member ON task_assignees(member_id);
CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_absences_member ON absences(member_id);
CREATE INDEX idx_shifts_member_date ON shifts(member_id, date);
CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_team_statuses_team ON team_statuses(team_id);
CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp DESC);

-- ===================
-- 4. updated_at trigger
-- ===================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
