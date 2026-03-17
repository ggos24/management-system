-- Live task copies across workspaces via junction table
CREATE TABLE task_team_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status text NOT NULL,
  sort_order int DEFAULT 0,
  custom_field_values JSONB DEFAULT '{}',
  added_by UUID REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, team_id)
);

-- Trigger: prevent linking task to its own home team
CREATE FUNCTION prevent_self_team_link() RETURNS trigger AS $$
BEGIN
  IF NEW.team_id = (SELECT team_id FROM tasks WHERE id = NEW.task_id) THEN
    RAISE EXCEPTION 'Cannot link a task to its home team';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_self_team_link
  BEFORE INSERT OR UPDATE ON task_team_links
  FOR EACH ROW EXECUTE FUNCTION prevent_self_team_link();

-- RLS + indexes
ALTER TABLE task_team_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON task_team_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON task_team_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON task_team_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON task_team_links FOR DELETE TO authenticated USING (true);
CREATE INDEX idx_ttl_task ON task_team_links(task_id);
CREATE INDEX idx_ttl_team ON task_team_links(team_id);
