BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(11);

INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'subtask-full@example.test', '{"name":"Full User"}'),
  ('c1000000-0000-4000-8000-000000000002', 'subtask-external-one@example.test', '{"name":"External One"}'),
  ('c1000000-0000-4000-8000-000000000003', 'subtask-external-two@example.test', '{"name":"External Two"}');

INSERT INTO teams(id, name) VALUES ('c2000000-0000-4000-8000-000000000001', 'Subtask Team');
UPDATE profiles SET access_scope = 'full', role = 'admin', team_id = 'c2000000-0000-4000-8000-000000000001'
WHERE auth_user_id = 'c1000000-0000-4000-8000-000000000001';

CREATE TEMP TABLE subtask_actors AS
SELECT auth_user_id, id AS profile_id FROM profiles
WHERE auth_user_id::text LIKE 'c1000000-%';
GRANT SELECT ON subtask_actors TO authenticated;

INSERT INTO tasks(id, title, team_id) VALUES
  ('c3000000-0000-4000-8000-000000000001', 'Parent task', 'c2000000-0000-4000-8000-000000000001');
INSERT INTO task_assignees(task_id, member_id)
SELECT 'c3000000-0000-4000-8000-000000000001', profile_id FROM subtask_actors
WHERE auth_user_id IN (
  'c1000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000003'
);

INSERT INTO task_subtasks(id, task_id, title, assignee_id, start_date, end_date)
SELECT 'c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'External one work', profile_id, '2026-10-02', '2026-10-04'
FROM subtask_actors WHERE auth_user_id = 'c1000000-0000-4000-8000-000000000002';
INSERT INTO task_subtasks(id, task_id, title, assignee_id)
SELECT 'c4000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
  'External two work', profile_id
FROM subtask_actors WHERE auth_user_id = 'c1000000-0000-4000-8000-000000000003';

SELECT is((SELECT count(*)::integer FROM task_subtasks), 2, 'two separate subtasks exist');
SELECT is((SELECT created_at IS NOT NULL FROM task_subtasks WHERE id = 'c4000000-0000-4000-8000-000000000001'), true,
  'creation timestamp is automatic');

SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::integer FROM task_subtasks), 2, 'external task participant can read its subtasks');
SELECT lives_ok(
  $$ SELECT public.set_task_subtask_completion('c4000000-0000-4000-8000-000000000001', true) $$,
  'external assignee can complete own subtask'
);
SELECT throws_ok(
  $$ SELECT public.set_task_subtask_completion('c4000000-0000-4000-8000-000000000002', true) $$,
  'P0001', 'Subtask unavailable',
  'external participant cannot complete another assignee subtask'
);
SELECT is_empty(
  $$ UPDATE task_subtasks SET title = 'Unauthorized edit' WHERE id = 'c4000000-0000-4000-8000-000000000001' RETURNING id $$,
  'external assignee cannot change subtask fields directly'
);
RESET ROLE;

SELECT is((SELECT completed FROM task_subtasks WHERE id = 'c4000000-0000-4000-8000-000000000001'), true,
  'only the own completion state changed');
SELECT is((SELECT title FROM task_subtasks WHERE id = 'c4000000-0000-4000-8000-000000000001'), 'External one work',
  'subtask metadata remains unchanged');

SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.save_task_with_subtasks(
    '{"id":"c3000000-0000-4000-8000-000000000002","title":"New task with subtasks","team_id":"c2000000-0000-4000-8000-000000000001"}'::jsonb,
    '{}'::uuid[], '{}'::text[],
    '[{"id":"c4000000-0000-4000-8000-000000000003","title":"First","startDate":"2026-10-02"},{"id":"c4000000-0000-4000-8000-000000000004","title":"Second","completed":true}]'::jsonb
  ) $$,
  'full user can save a new task and draft subtasks atomically'
);
SELECT is((SELECT count(*)::integer FROM task_subtasks WHERE task_id = 'c3000000-0000-4000-8000-000000000002'), 2,
  'both draft subtasks were created');
SELECT is((SELECT count(*)::integer FROM task_subtasks WHERE task_id = 'c3000000-0000-4000-8000-000000000002' AND completed), 1,
  'draft completion state is stored separately from description checklists');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
