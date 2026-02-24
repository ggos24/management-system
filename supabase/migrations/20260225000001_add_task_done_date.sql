-- Add done_date column to tasks
ALTER TABLE tasks ADD COLUMN done_date DATE DEFAULT NULL;
