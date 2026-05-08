-- Switch tasks/task_team_links from string-label status to FK by team_statuses.id.
-- Renames are now safe: changing team_statuses.name does not orphan tasks.

-- 1. tasks
ALTER TABLE tasks ADD COLUMN status_id uuid REFERENCES team_statuses(id) ON DELETE SET NULL;

UPDATE tasks
SET status_id = ts.id
FROM team_statuses ts
WHERE ts.team_id = tasks.team_id
  AND ts.name = tasks.status;

CREATE INDEX idx_tasks_status_id ON tasks(status_id);
ALTER TABLE tasks DROP COLUMN status;

-- 2. task_team_links
ALTER TABLE task_team_links ADD COLUMN status_id uuid REFERENCES team_statuses(id) ON DELETE SET NULL;

UPDATE task_team_links
SET status_id = ts.id
FROM team_statuses ts
WHERE ts.team_id = task_team_links.team_id
  AND ts.name = task_team_links.status;

CREATE INDEX idx_ttl_status_id ON task_team_links(status_id);
ALTER TABLE task_team_links DROP COLUMN status;

-- 3. team_hidden_columns
-- column_key is polymorphic: status name OR custom property uuid.
-- Migrate status-name keys to status uuids; property uuid keys won't match the join (left untouched).
UPDATE team_hidden_columns thc
SET column_key = ts.id::text
FROM team_statuses ts
WHERE thc.team_id = ts.team_id
  AND thc.column_key = ts.name;

-- Notifications.entity_data may carry the status name in audit logs — leave as-is (frozen history).
