CREATE TABLE team_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  UNIQUE(team_id, name)
);
ALTER TABLE team_placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON team_placements FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON team_placements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON team_placements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON team_placements FOR DELETE TO authenticated USING (true);
CREATE INDEX idx_tp_team ON team_placements(team_id);

-- Seed: copy all existing placements into every team
INSERT INTO team_placements (team_id, name, sort_order)
SELECT t.id, p.name, p.sort_order
FROM teams t CROSS JOIN placements p;
