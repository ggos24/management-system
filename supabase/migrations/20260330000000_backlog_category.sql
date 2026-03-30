-- Add 'backlog' to status category options
ALTER TABLE team_statuses DROP CONSTRAINT IF EXISTS team_statuses_category_check;
ALTER TABLE team_statuses ADD CONSTRAINT team_statuses_category_check
  CHECK (category IN ('active', 'backlog', 'completed', 'ignored'));

-- Set existing 'Backlog' statuses to 'backlog' category
UPDATE team_statuses SET category = 'backlog' WHERE LOWER(name) = 'backlog' AND category = 'active';
