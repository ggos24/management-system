-- Dedup table for the daily deadline-reminder cron job.
-- Primary key (task_id, due_date, offset_days) guarantees a given reminder
-- fires at most once per task/due-date/offset. Re-running the cron is idempotent.
-- If a user changes due_date, the new date gets a fresh row and re-notifies.
-- Cascade clears rows when a task is hard-deleted.

CREATE TABLE IF NOT EXISTS task_deadline_reminders (
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  offset_days SMALLINT NOT NULL CHECK (offset_days IN (1, 3)),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, due_date, offset_days)
);

ALTER TABLE task_deadline_reminders ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (useful for in-app debugging panels).
-- Writes happen only via service role from the Vercel cron function.
CREATE POLICY "Authenticated can select task_deadline_reminders"
  ON task_deadline_reminders FOR SELECT TO authenticated USING (true);
