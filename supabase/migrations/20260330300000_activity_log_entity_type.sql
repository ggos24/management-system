-- Add entity_type column for structured filtering of activity logs
ALTER TABLE activity_log ADD COLUMN entity_type text;

-- Indexes for common filter queries
CREATE INDEX idx_activity_log_entity_type ON activity_log(entity_type);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);

-- Backfill existing rows
UPDATE activity_log SET entity_type = 'member'
  WHERE action IN ('Member Removed', 'Member Invited');
UPDATE activity_log SET entity_type = 'integration'
  WHERE action = 'Integration Update';
