-- Task comments table
CREATE TABLE task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_user_id ON task_comments(user_id);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read comments
CREATE POLICY "Authenticated can select task_comments"
  ON task_comments FOR SELECT TO authenticated USING (true);

-- Any authenticated user can insert comments (user_id must match own profile)
CREATE POLICY "Users can insert own task_comments"
  ON task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Users can update their own comments, admins can update any
CREATE POLICY "Users can update own task_comments"
  ON task_comments FOR UPDATE TO authenticated
  USING (is_admin() OR user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Users can delete their own comments, admins can delete any
CREATE POLICY "Users can delete own task_comments"
  ON task_comments FOR DELETE TO authenticated
  USING (is_admin() OR user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
