-- Task activity log for tracking field-level changes
CREATE TABLE task_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_activity_task_id ON task_activity(task_id);

ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select task_activity"
  ON task_activity FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert own task_activity"
  ON task_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
