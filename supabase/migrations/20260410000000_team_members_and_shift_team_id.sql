-- ============================================================
-- Multi-team membership + team-scoped shifts
--
-- Adds a team_members junction so one profile can belong to
-- multiple teams (e.g. Main team + Rapid Response). profiles.team_id
-- is kept as the denormalized "primary / home team" cache.
--
-- Adds team_id to shifts so a person can have different shifts
-- in different teams on the same day.
--
-- Absences stay person-scoped (member_id only).
-- ============================================================

-- ------------------------------------------------------------
-- 1. team_members junction table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, profile_id)
);

-- Exactly one primary team per profile (enforced at DB level)
CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_primary_per_profile
  ON team_members(profile_id) WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_team_members_profile ON team_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team    ON team_members(team_id);

-- Realtime: need full row payloads for RLS filtering, add to publication
ALTER TABLE team_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;

-- RLS: read for everyone authenticated, writes admin-only
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read team_members" ON team_members
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Admins manage team_members" ON team_members
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------------------------
-- 2. Backfill from profiles.team_id
--    Every profile with a team_id becomes a primary team_members row.
-- ------------------------------------------------------------
INSERT INTO team_members (team_id, profile_id, is_primary)
SELECT team_id, id, TRUE
FROM profiles
WHERE team_id IS NOT NULL
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. shifts.team_id (nullable, then backfill, then NOT NULL)
-- ------------------------------------------------------------
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Populate team_id from each shift's member primary team
UPDATE shifts s
  SET team_id = p.team_id
  FROM profiles p
  WHERE s.member_id = p.id
    AND s.team_id IS NULL
    AND p.team_id IS NOT NULL;

-- Surface any orphan shifts before dropping them (members with no team)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM shifts WHERE team_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Dropping % orphan shift row(s) whose member has no team_id', orphan_count;
  END IF;
END $$;

DELETE FROM shifts WHERE team_id IS NULL;

ALTER TABLE shifts ALTER COLUMN team_id SET NOT NULL;

-- Replace the old (member_id, date) index with a team-aware one
DROP INDEX IF EXISTS idx_shifts_member_date;
CREATE INDEX IF NOT EXISTS idx_shifts_member_team_date
  ON shifts(member_id, team_id, date);
