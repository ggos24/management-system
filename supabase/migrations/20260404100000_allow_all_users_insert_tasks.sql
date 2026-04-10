-- Allow all authenticated users to create and update tasks in any team
DROP POLICY IF EXISTS "Users manage own team tasks" ON tasks;
CREATE POLICY "Authenticated can insert tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users update own team tasks" ON tasks;
CREATE POLICY "Authenticated can update tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (true);

-- Allow all authenticated users to manage task assignees (cross-team assignments)
DROP POLICY IF EXISTS "Users manage task_assignees for own team" ON task_assignees;
CREATE POLICY "Authenticated can manage task_assignees" ON task_assignees
  FOR ALL TO authenticated
  USING (true);

