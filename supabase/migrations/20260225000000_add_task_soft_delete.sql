-- Add soft-delete columns to tasks
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN deleted_by UUID REFERENCES profiles(id) DEFAULT NULL;

-- Index for active tasks (used by all normal queries)
CREATE INDEX idx_tasks_active ON tasks(team_id, sort_order) WHERE deleted_at IS NULL;

-- Index for bin view (deleted tasks sorted by deletion time)
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at DESC) WHERE deleted_at IS NOT NULL;
