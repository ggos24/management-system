-- Add sort_order column to tasks table for within-status-group reordering
ALTER TABLE tasks ADD COLUMN sort_order int DEFAULT 0;

-- Backfill existing tasks: assign sort_order based on created_at order within each status group
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at) AS rn
  FROM tasks
)
UPDATE tasks SET sort_order = ranked.rn
FROM ranked WHERE tasks.id = ranked.id;
