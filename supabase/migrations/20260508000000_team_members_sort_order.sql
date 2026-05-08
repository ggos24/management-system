-- ============================================================
-- Per-team schedule sort order for members.
--
-- Previously schedule_sort_order lived on profiles, which is global
-- per person. With multi-team membership a member appears in several
-- team rows in the schedule view, but their order was driven by a
-- single global value. Reordering members in one team mutated that
-- global value and shifted the same person (and other members whose
-- values collided) in unrelated teams.
--
-- Move sort_order onto the team_members junction so each team has its
-- own ordering. profiles.schedule_sort_order is left in place for
-- safety; it is no longer read or written by the app.
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Backfill: every existing team_members row inherits the profile's
-- old global value, so the first render after deploy keeps the
-- ordering people were used to.
UPDATE team_members tm
SET sort_order = COALESCE(p.schedule_sort_order, 0)
FROM profiles p
WHERE tm.profile_id = p.id;

CREATE INDEX IF NOT EXISTS idx_team_members_team_sort_order
  ON team_members(team_id, sort_order);
