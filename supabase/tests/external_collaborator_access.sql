BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO service_role;

SELECT plan(75);

-- Stable fixture IDs are used for domain rows. Profile IDs come from the auth
-- trigger and are captured in a temporary lookup table.
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'acl-admin@example.test', '{"name":"ACL Admin"}'),
  ('a1000000-0000-4000-8000-000000000002', 'acl-external-1@example.test', '{"name":"ACL External One"}'),
  ('a1000000-0000-4000-8000-000000000003', 'acl-external-2@example.test', '{"name":"ACL External Two"}'),
  ('a1000000-0000-4000-8000-000000000004', 'acl-internal@example.test', '{"name":"ACL Internal"}');

INSERT INTO teams(id, name) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'ACL Home'),
  ('a2000000-0000-4000-8000-000000000002', 'ACL Linked');

UPDATE profiles
SET access_scope = 'full',
    role = 'admin',
    team_id = 'a2000000-0000-4000-8000-000000000001'
WHERE auth_user_id = 'a1000000-0000-4000-8000-000000000001';
UPDATE profiles
SET access_scope = 'related_only', role = 'user', team_id = NULL
WHERE auth_user_id IN (
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003'
);
UPDATE profiles
SET access_scope = 'full',
    team_id = 'a2000000-0000-4000-8000-000000000001'
WHERE auth_user_id = 'a1000000-0000-4000-8000-000000000004';

CREATE TEMP TABLE acl_test_actors AS
SELECT CASE auth_user_id
         WHEN 'a1000000-0000-4000-8000-000000000001' THEN 'admin'
         WHEN 'a1000000-0000-4000-8000-000000000002' THEN 'external_1'
         WHEN 'a1000000-0000-4000-8000-000000000003' THEN 'external_2'
         ELSE 'internal'
       END AS label,
       id AS profile_id,
       auth_user_id
FROM profiles
WHERE auth_user_id::text LIKE 'a1000000-%';

GRANT SELECT ON acl_test_actors TO authenticated;
GRANT SELECT ON acl_test_actors TO service_role;

INSERT INTO team_members(team_id, profile_id, is_primary)
SELECT 'a2000000-0000-4000-8000-000000000001', profile_id, true
FROM acl_test_actors
WHERE label IN ('admin', 'internal');

INSERT INTO permissions(member_id, can_create, can_edit, can_delete)
SELECT profile_id, true, false, false
FROM acl_test_actors
ON CONFLICT (member_id) DO NOTHING;

-- Public signup is intentionally enabled in the project. The auth trigger must
-- never let a caller obtain full access by creating an auth user directly.
INSERT INTO auth.users(id, email, raw_user_meta_data)
VALUES (
  'b1000000-0000-4000-8000-000000000001',
  'acl-raw-signup@example.test',
  '{"name":"ACL Raw Signup","avatar_url":"https://example.test/avatar.png"}'
);

SELECT results_eq(
  $$
    SELECT role, access_scope, team_id IS NULL
    FROM profiles
    WHERE auth_user_id = 'b1000000-0000-4000-8000-000000000001'
  $$,
  $$ VALUES ('user'::text, 'related_only'::text, true) $$,
  'a raw auth signup is always a teamless related-only user'
);
SELECT is(
  (
    SELECT permissions.can_create
    FROM permissions
    JOIN profiles ON profiles.id = permissions.member_id
    WHERE profiles.auth_user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  true,
  'a raw signup receives only latent default permissions for later conversion'
);

SELECT lives_ok(
  $$
    INSERT INTO notification_preferences(user_id, category, channel, enabled)
    SELECT id, 'support', 'in_app', true
    FROM profiles
    WHERE auth_user_id = 'b1000000-0000-4000-8000-000000000001'
  $$,
  'notification preferences accept the Support category used by the client'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM legacy_profile_mention_positions(
      '(@ACLExternalTwo,thanks) @ACLExternalTwo! @ACLExternalTwo',
      'ACL External Two'
    )
  ),
  3,
  'legacy mention matching follows client boundaries and deduplicates per occurrence'
);

SELECT is(
  has_function_privilege('authenticated', 'public.compute_task_access_grants(uuid)', 'EXECUTE'),
  false,
  'authenticated cannot execute the grant enumeration helper'
);
SELECT is(
  has_function_privilege('authenticated', 'public.bump_task_access_revision(uuid)', 'EXECUTE'),
  false,
  'authenticated cannot execute the revision mutation helper'
);
SELECT is(
  has_function_privilege('authenticated', 'public.rebuild_task_access_grants(uuid)', 'EXECUTE'),
  false,
  'authenticated cannot execute the grant rebuild helper'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.remap_linked_comment_contexts_before_team_delete()',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot invoke the team-delete remap trigger directly'
);
SELECT is(
  has_function_privilege('anon', 'public.update_own_profile(text,text,text)', 'EXECUTE'),
  false,
  'anonymous callers cannot execute authenticated profile RPCs'
);
SELECT is(
  has_function_privilege('authenticated', 'public.update_own_profile(text,text,text)', 'EXECUTE'),
  true,
  'authenticated callers retain the intended safe profile RPC'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.claim_external_notification_delivery(uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot claim outbound delivery ledger rows'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.mark_external_notification_delivery_sent(uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot mark outbound deliveries sent'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.claim_external_notification_delivery(uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'service role can atomically claim an outbound mention delivery'
);
SELECT is(
  has_table_privilege('authenticated', 'public.external_notification_deliveries', 'SELECT'),
  false,
  'outbound delivery ledger rows are not exposed to authenticated users'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.claim_restricted_task_notification_delivery(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot claim restricted task transport windows'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.mark_restricted_task_notification_delivery_sent(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot mark restricted task transport claims sent'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.claim_restricted_task_notification_delivery(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'service role can atomically claim a restricted task transport window'
);
SELECT is(
  has_table_privilege(
    'authenticated',
    'public.restricted_task_notification_deliveries',
    'SELECT'
  ),
  false,
  'restricted task transport claims are not exposed to authenticated users'
);
SELECT results_eq(
  $$
    SELECT id, public
    FROM storage.buckets
    WHERE id IN ('docs-assets', 'ticket-attachments')
    ORDER BY id
  $$,
  $$ VALUES
       ('docs-assets'::text, false),
       ('ticket-attachments'::text, false) $$,
  'docs and ticket attachment buckets are private'
);
SELECT is(
  (
    SELECT relation.relrowsecurity
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
  ),
  true,
  'storage.objects relies on the Supabase-owned RLS baseline without altering ownership'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Public read access for doc assets',
        'Public read access for ticket attachments'
      )
  ),
  0,
  'legacy public attachment read policies are removed'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Full users can read doc assets',
        'Full users can read ticket attachments',
        'Full users can upload doc assets'
      )
  ),
  3,
  'private attachment read and docs upload policies are installed'
);
SELECT is(
  has_column_privilege('authenticated', 'public.notifications', 'read', 'UPDATE'),
  true,
  'authenticated recipients may update the notification read marker'
);
SELECT is(
  has_column_privilege('authenticated', 'public.notifications', 'message', 'UPDATE'),
  false,
  'authenticated recipients cannot rewrite notification content'
);

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT ON storage.objects TO authenticated;
INSERT INTO storage.objects(id, bucket_id, name) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'docs-assets', 'private-doc.txt'),
  ('e1000000-0000-4000-8000-000000000002', 'ticket-attachments', 'private-ticket.txt');

INSERT INTO team_statuses(id, team_id, name, category) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Active', 'active'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Backlog', 'backlog');

INSERT INTO custom_properties(id, team_id, name, type) VALUES
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Home person', 'person'),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Linked person', 'person');

INSERT INTO tasks(id, title, team_id, status_id, editor_ids, designer_ids, custom_field_values)
SELECT 'a5000000-0000-4000-8000-000000000001',
       'ACL task',
       'a2000000-0000-4000-8000-000000000001',
       'a3000000-0000-4000-8000-000000000001',
       jsonb_build_array((SELECT profile_id FROM acl_test_actors WHERE label = 'internal')),
       '[]'::jsonb,
       '{}'::jsonb;

INSERT INTO tasks(id, title, team_id, status_id)
VALUES (
  'a5000000-0000-4000-8000-000000000002',
  'ACL unrelated task',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001'
);

INSERT INTO task_team_links(id, task_id, team_id, status_id, custom_field_values)
VALUES (
  'a6000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000002',
  '{}'::jsonb
);

INSERT INTO task_assignees(task_id, member_id)
SELECT 'a5000000-0000-4000-8000-000000000001', profile_id
FROM acl_test_actors WHERE label = 'external_1';

INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
SELECT external.profile_id,
       admin.profile_id,
       'comment_mention',
       'Legacy support title must stay hidden',
       '{"ticketId":"a9000000-0000-4000-8000-000000000001"}'::jsonb
FROM acl_test_actors external, acl_test_actors admin
WHERE external.label = 'external_1' AND admin.label = 'admin';
INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
SELECT external.profile_id,
       admin.profile_id,
       event.type,
       event.message,
       jsonb_build_object(
         'taskId', 'a5000000-0000-4000-8000-000000000002',
         'teamId', 'a2000000-0000-4000-8000-000000000001'
       )
FROM acl_test_actors external,
     acl_test_actors admin,
     (VALUES
       ('task_updated'::text, 'Unrelated task update'),
       ('task_deadline_reminder'::text, 'Unrelated task deadline')
     ) event(type, message)
WHERE external.label = 'external_1' AND admin.label = 'admin';
INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
SELECT external.profile_id,
       admin.profile_id,
       'comment_mention',
       'Task mention remains visible',
       jsonb_build_object(
         'taskId', 'a5000000-0000-4000-8000-000000000001',
         'teamId', 'a2000000-0000-4000-8000-000000000001'
       )
FROM acl_test_actors external, acl_test_actors admin
WHERE external.label = 'external_1' AND admin.label = 'admin';

-- External 1: assigned task is visible and immutable.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT id FROM tasks $$,
  $$ VALUES ('a5000000-0000-4000-8000-000000000001'::uuid) $$,
  'assignee can read the related task'
);
SELECT results_eq(
  $$ SELECT context_team_id FROM get_my_task_access_contexts() $$,
  $$ VALUES ('a2000000-0000-4000-8000-000000000001'::uuid) $$,
  'assignee receives the home workspace context'
);
SELECT is_empty(
  $$ SELECT id FROM notifications WHERE entity_data ? 'ticketId' $$,
  'related-only recipients cannot read historical Support mentions'
);
SELECT results_eq(
  $$ SELECT message FROM notifications WHERE entity_data ? 'taskId' $$,
  $$ VALUES ('Task mention remains visible'::text) $$,
  'task-shaped mention notifications remain visible for an authorized context'
);
SELECT is_empty(
  $$ SELECT id FROM notifications WHERE message = 'Unrelated task update' $$,
  'related-only recipients cannot read task updates for unrelated tasks'
);
SELECT is_empty(
  $$ SELECT id FROM notifications WHERE message = 'Unrelated task deadline' $$,
  'related-only recipients cannot read deadline events for unrelated tasks'
);
SELECT is_empty(
  $$
    SELECT id
    FROM storage.objects
    WHERE bucket_id IN ('docs-assets', 'ticket-attachments')
  $$,
  'related-only users cannot read private docs or ticket attachments'
);
SELECT throws_ok(
  $$
    INSERT INTO storage.objects(id, bucket_id, name)
    VALUES (
      'e1000000-0000-4000-8000-000000000003',
      'docs-assets',
      'external-upload.txt'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'related-only users cannot upload docs assets'
);
SELECT is_empty(
  $$
    WITH changed AS (
      UPDATE tasks
      SET title = 'forbidden'
      WHERE id = 'a5000000-0000-4000-8000-000000000001'
      RETURNING id
    )
    SELECT id FROM changed
  $$,
  'related-only user cannot update a task'
);
SELECT is_empty(
  $$
    WITH changed AS (
      UPDATE profiles
      SET role = 'admin'
      WHERE auth_user_id = 'a1000000-0000-4000-8000-000000000002'
      RETURNING id
    )
    SELECT id FROM changed
  $$,
  'related-only user cannot elevate their own role'
);
SELECT lives_ok(
  $$ SELECT update_own_profile('ACL External Renamed', NULL, NULL) $$,
  'safe own-profile RPC remains available'
);
SELECT results_eq(
  $$ SELECT role, access_scope FROM profiles WHERE auth_user_id = 'a1000000-0000-4000-8000-000000000002' $$,
  $$ VALUES ('user'::text, 'related_only'::text) $$,
  'own-profile RPC cannot alter role or access scope'
);

SELECT throws_ok(
  $$
    SELECT create_task_comment_with_mentions(
      'a5000000-0000-4000-8000-000000000001',
      'not allowed',
      'a2000000-0000-4000-8000-000000000001',
      ARRAY[(SELECT profile_id FROM acl_test_actors WHERE label = 'external_2')]
    )
  $$,
  'P0001',
  'External collaborators may mention only existing task participants',
  'external comment cannot expand the participant set'
);
SELECT lives_ok(
  $$
    SELECT create_task_comment_with_mentions(
      'a5000000-0000-4000-8000-000000000001',
      'existing participant',
      'a2000000-0000-4000-8000-000000000001',
      ARRAY[(SELECT profile_id FROM acl_test_actors WHERE label = 'internal')]
    )
  $$,
  'external comment can mention an existing participant'
);

SELECT throws_ok(
  $$
    INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
    SELECT
      (SELECT profile_id FROM acl_test_actors WHERE label = 'internal'),
      (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
      'comment_mention',
      'forged mention',
      jsonb_build_object(
        'taskId', 'a5000000-0000-4000-8000-000000000001',
        'contextTeamId', 'a2000000-0000-4000-8000-000000000001',
        'commentId', 'c1000000-0000-4000-8000-000000000001'
      )
  $$,
  '42501',
  'new row violates row-level security policy for table "notifications"',
  'external cannot forge a mention notification without a persisted mention row'
);

RESET ROLE;
INSERT INTO notification_preferences(user_id, category, channel, enabled)
SELECT profile_id, 'mentions', 'in_app', false
FROM acl_test_actors WHERE label = 'internal';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$
    INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
    SELECT
      (SELECT profile_id FROM acl_test_actors WHERE label = 'internal'),
      (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
      'comment_mention',
      'real mention while opted out',
      jsonb_build_object(
        'taskId', 'a5000000-0000-4000-8000-000000000001',
        'contextTeamId', 'a2000000-0000-4000-8000-000000000001',
        'commentId', (SELECT id FROM task_comments WHERE content = 'existing participant')
      )
  $$,
  '42501',
  'new row violates row-level security policy for table "notifications"',
  'recipient in-app mention opt-out is enforced without exposing preferences'
);

RESET ROLE;
DELETE FROM notification_preferences
WHERE user_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'internal')
  AND category = 'mentions' AND channel = 'in_app';
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
    SELECT
      (SELECT profile_id FROM acl_test_actors WHERE label = 'internal'),
      (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
      'comment_mention',
      'persisted mention',
      jsonb_build_object(
        'taskId', 'a5000000-0000-4000-8000-000000000001',
        'contextTeamId', 'a2000000-0000-4000-8000-000000000001',
        'commentId', (SELECT id FROM task_comments WHERE content = 'existing participant')
      )
  $$,
  'persisted external mention can notify an opted-in participant after commit'
);

RESET ROLE;
GRANT SELECT ON task_comments TO service_role;
CREATE TEMP TABLE restricted_task_claim_test(claim_id uuid);
GRANT SELECT, INSERT ON restricted_task_claim_test TO service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT is(
  claim_external_notification_delivery(
    (SELECT id FROM task_comments WHERE content = 'existing participant'),
    (SELECT profile_id FROM acl_test_actors WHERE label = 'internal'),
    'email'
  ),
  true,
  'service role atomically claims the first outbound delivery'
);
SELECT is(
  claim_external_notification_delivery(
    (SELECT id FROM task_comments WHERE content = 'existing participant'),
    (SELECT profile_id FROM acl_test_actors WHERE label = 'internal'),
    'email'
  ),
  false,
  'a repeated outbound delivery claim is rejected'
);
SELECT is(
  mark_external_notification_delivery_sent(
    (SELECT id FROM task_comments WHERE content = 'existing participant'),
    (SELECT profile_id FROM acl_test_actors WHERE label = 'internal'),
    'email'
  ),
  true,
  'service role marks a claimed delivery sent after transport success'
);
INSERT INTO restricted_task_claim_test(claim_id)
SELECT claim_restricted_task_notification_delivery(
  (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'task_updated',
  'email'
);
SELECT is(
  (SELECT claim_id IS NOT NULL FROM restricted_task_claim_test),
  true,
  'the first related-recipient task transport receives an opaque claim ID'
);
SELECT is(
  claim_restricted_task_notification_delivery(
    (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
    'a5000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'task_updated',
    'email'
  ) IS NULL,
  true,
  'the same task transport tuple is suppressed within its one-minute window'
);
SELECT is(
  claim_restricted_task_notification_delivery(
    (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
    'a5000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'task_status_changed',
    'email'
  ) IS NOT NULL,
  true,
  'a distinct task event type remains deliverable in the same minute'
);
SELECT is(
  mark_restricted_task_notification_delivery_sent(
    (SELECT claim_id FROM restricted_task_claim_test)
  ),
  true,
  'service role marks a restricted task transport claim sent by claim ID'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT is(
  (
    SELECT count(*)::integer
    FROM task_access_grants g
    JOIN task_comments c ON c.id = g.source_id
    WHERE g.source_type = 'comment_mention'
      AND c.content = 'existing participant'
  ),
  0,
  'external-authored structured mention creates no access grant'
);

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    INSERT INTO storage.objects(id, bucket_id, name) VALUES
      ('e1000000-0000-4000-8000-000000000004', 'docs-assets', 'full-doc.txt'),
      ('e1000000-0000-4000-8000-000000000005', 'ticket-attachments', 'full-ticket.txt')
  $$,
  'full-access users can upload to both private attachment buckets'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM storage.objects
    WHERE bucket_id IN ('docs-assets', 'ticket-attachments')
  ),
  4,
  'full-access users can read private docs and ticket attachments'
);
SELECT lives_ok(
  $$
    SELECT update_task_comment_with_mentions(
      (SELECT id FROM task_comments WHERE content = 'existing participant'),
      'moderated by admin',
      'a2000000-0000-4000-8000-000000000001',
      '{}'::uuid[]
    )
  $$,
  'full-access editor can edit another author comment as before'
);
RESET ROLE;

-- Scalar/array home Person values and linked Person context.
UPDATE tasks
SET custom_field_values = jsonb_build_object(
  'a4000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
    (SELECT profile_id FROM acl_test_actors WHERE label = 'external_2')
  )
)
WHERE id = 'a5000000-0000-4000-8000-000000000001';
UPDATE task_team_links
SET custom_field_values = jsonb_build_object(
  'a4000000-0000-4000-8000-000000000002',
  (SELECT profile_id::text FROM acl_test_actors WHERE label = 'external_2')
)
WHERE id = 'a6000000-0000-4000-8000-000000000001';

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT context_team_id FROM get_my_task_access_contexts() ORDER BY context_team_id $$,
  $$ VALUES
       ('a2000000-0000-4000-8000-000000000001'::uuid),
       ('a2000000-0000-4000-8000-000000000002'::uuid) $$,
  'array home Person plus scalar linked Person produce distinct contexts'
);

RESET ROLE;
UPDATE tasks SET custom_field_values = '{}' WHERE id = 'a5000000-0000-4000-8000-000000000001';
UPDATE task_team_links SET custom_field_values = '{}' WHERE id = 'a6000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ SELECT id FROM tasks $$,
  'removing the last custom Person source revokes access'
);

-- A full-access comment grants the exact linked context, and deletion revokes it.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    SELECT create_task_comment_with_mentions(
      'a5000000-0000-4000-8000-000000000001',
      'linked grant',
      'a2000000-0000-4000-8000-000000000002',
      ARRAY[(SELECT profile_id FROM acl_test_actors WHERE label = 'external_2')]
    )
  $$,
  'full-access structured mention creates a grant'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT context_team_id FROM get_my_task_access_contexts() $$,
  $$ VALUES ('a2000000-0000-4000-8000-000000000002'::uuid) $$,
  'mention grant retains its linked workspace context'
);
RESET ROLE;
DELETE FROM task_comments WHERE content = 'linked grant';
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$ SELECT id FROM tasks $$, 'deleting the last mention source revokes access');

-- Multiple sources retain access until the last source disappears.
RESET ROLE;
UPDATE tasks
SET editor_ids = jsonb_build_array((SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'))
WHERE id = 'a5000000-0000-4000-8000-000000000001';
DELETE FROM task_assignees
WHERE task_id = 'a5000000-0000-4000-8000-000000000001'
  AND member_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1');
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT id FROM tasks $$,
  $$ VALUES ('a5000000-0000-4000-8000-000000000001'::uuid) $$,
  'removing one of multiple sources keeps access'
);
RESET ROLE;
UPDATE tasks SET editor_ids = '[]' WHERE id = 'a5000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$ SELECT id FROM tasks $$, 'removing the final source revokes access');

-- SECURITY DEFINER task saves must not widen the old placement policy: a full
-- user may save a foreign-team task only when its placement set is unchanged.
RESET ROLE;
INSERT INTO placements(id, name) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'ACL locked placement');
INSERT INTO tasks(id, title, team_id, status_id)
VALUES (
  'a8000000-0000-4000-8000-000000000001',
  'Foreign task',
  'a2000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000002'
);
INSERT INTO task_placements(task_id, placement_id)
VALUES (
  'a8000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001'
);
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    SELECT save_task_with_relations(
      jsonb_build_object(
        'id', 'a8000000-0000-4000-8000-000000000001',
        'title', 'Foreign task metadata update',
        'team_id', 'a2000000-0000-4000-8000-000000000002',
        'status_id', 'a3000000-0000-4000-8000-000000000002'
      ),
      '{}'::uuid[],
      ARRAY['ACL locked placement']
    )
  $$,
  'full user can save a foreign-team task when placements are unchanged'
);
SELECT throws_ok(
  $$
    SELECT save_task_with_relations(
      jsonb_build_object(
        'id', 'a8000000-0000-4000-8000-000000000001',
        'title', 'Forbidden placement update',
        'team_id', 'a2000000-0000-4000-8000-000000000002',
        'status_id', 'a3000000-0000-4000-8000-000000000002'
      ),
      '{}'::uuid[],
      '{}'::text[]
    )
  $$,
  'P0001',
  'You cannot change placements for a task outside your team',
  'full user cannot mutate placements on a foreign-team task'
);

-- Moving a child row must rebuild both its old and new task. Otherwise the old
-- task retains a stale grant while the destination can miss its new grant.
RESET ROLE;
INSERT INTO tasks(id, title, team_id, status_id) VALUES
  (
    'c5000000-0000-4000-8000-000000000001',
    'Grant move source',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001'
  ),
  (
    'c5000000-0000-4000-8000-000000000002',
    'Grant move destination',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001'
  );
INSERT INTO task_assignees(task_id, member_id)
SELECT 'c5000000-0000-4000-8000-000000000001', profile_id
FROM acl_test_actors WHERE label = 'external_2';
UPDATE task_assignees
SET task_id = 'c5000000-0000-4000-8000-000000000002'
WHERE task_id = 'c5000000-0000-4000-8000-000000000001'
  AND member_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'external_2');
SELECT results_eq(
  $$
    SELECT task_id
    FROM task_access_grants
    WHERE source_type = 'assignee'
      AND source_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'external_2')
      AND task_id IN (
        'c5000000-0000-4000-8000-000000000001',
        'c5000000-0000-4000-8000-000000000002'
      )
  $$,
  $$ VALUES ('c5000000-0000-4000-8000-000000000002'::uuid) $$,
  'moving an assignee revokes the old task grant and creates the new one'
);

INSERT INTO task_team_links(id, task_id, team_id, status_id, custom_field_values)
SELECT
  'c6000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'a4000000-0000-4000-8000-000000000002',
    (SELECT profile_id::text FROM acl_test_actors WHERE label = 'external_2')
  );
UPDATE task_team_links
SET task_id = 'c5000000-0000-4000-8000-000000000002'
WHERE id = 'c6000000-0000-4000-8000-000000000001';
SELECT results_eq(
  $$
    SELECT task_id
    FROM task_access_grants
    WHERE source_type = 'custom_person'
      AND source_id = 'a4000000-0000-4000-8000-000000000002'
      AND context_team_id = 'a2000000-0000-4000-8000-000000000002'
      AND task_id IN (
        'c5000000-0000-4000-8000-000000000001',
        'c5000000-0000-4000-8000-000000000002'
      )
  $$,
  $$ VALUES ('c5000000-0000-4000-8000-000000000002'::uuid) $$,
  'moving a linked Person row rebuilds grants for both task IDs'
);

-- Moving a task's home team uses the same OR-merge semantics: an older true
-- grant cannot be lost to a duplicate false mention in the destination.
INSERT INTO tasks(id, title, team_id, status_id)
VALUES (
  'f5000000-0000-4000-8000-000000000001',
  'Home context move task',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001'
);
INSERT INTO task_comments(id, task_id, user_id, content, context_team_id)
SELECT
  'f9000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  profile_id,
  'move home context without losing grant',
  'a2000000-0000-4000-8000-000000000001'
FROM acl_test_actors WHERE label = 'admin';
INSERT INTO task_comment_mentions(
  comment_id, task_id, profile_id, context_team_id, grants_access
)
SELECT
  'f9000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  profile_id,
  mention_context.context_team_id,
  mention_context.grants_access
FROM acl_test_actors
CROSS JOIN (VALUES
  ('a2000000-0000-4000-8000-000000000001'::uuid, true),
  ('a2000000-0000-4000-8000-000000000002'::uuid, false)
) AS mention_context(context_team_id, grants_access)
WHERE label = 'external_2';
UPDATE tasks
SET team_id = 'a2000000-0000-4000-8000-000000000002',
    status_id = 'a3000000-0000-4000-8000-000000000002'
WHERE id = 'f5000000-0000-4000-8000-000000000001';
SELECT results_eq(
  $$
    SELECT comment_row.context_team_id,
           mention.context_team_id,
           mention.grants_access,
           grant_row.context_team_id
    FROM task_comments comment_row
    JOIN task_comment_mentions mention ON mention.comment_id = comment_row.id
    JOIN task_access_grants grant_row
      ON grant_row.task_id = comment_row.task_id
     AND grant_row.profile_id = mention.profile_id
     AND grant_row.source_type = 'comment_mention'
     AND grant_row.source_id = comment_row.id
    WHERE comment_row.id = 'f9000000-0000-4000-8000-000000000001'
  $$,
  $$ VALUES (
       'a2000000-0000-4000-8000-000000000002'::uuid,
       'a2000000-0000-4000-8000-000000000002'::uuid,
       true,
       'a2000000-0000-4000-8000-000000000002'::uuid
     ) $$,
  'home-team moves deduplicate mentions without losing true grant access'
);

-- Deleting a linked workspace must preserve its task comments. Mentions are
-- deduplicated into the home context, with a true grants_access value winning.
INSERT INTO teams(id, name)
VALUES ('d2000000-0000-4000-8000-000000000001', 'Deleted linked context');
INSERT INTO team_statuses(id, team_id, name, category)
VALUES (
  'd3000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'Linked active',
  'active'
);
INSERT INTO tasks(id, title, team_id, status_id)
VALUES (
  'd5000000-0000-4000-8000-000000000001',
  'Comment context remap task',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001'
);
INSERT INTO task_team_links(id, task_id, team_id, status_id)
VALUES (
  'd6000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001'
);
INSERT INTO task_comments(id, task_id, user_id, content, context_team_id)
SELECT
  'd9000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  profile_id,
  'preserve me when linked team is deleted',
  'd2000000-0000-4000-8000-000000000001'
FROM acl_test_actors WHERE label = 'admin';
INSERT INTO task_comment_mentions(
  comment_id, task_id, profile_id, context_team_id, grants_access
)
SELECT
  'd9000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  profile_id,
  mention_context.context_team_id,
  mention_context.grants_access
FROM acl_test_actors
CROSS JOIN (VALUES
  ('a2000000-0000-4000-8000-000000000001'::uuid, false),
  ('d2000000-0000-4000-8000-000000000001'::uuid, true)
) AS mention_context(context_team_id, grants_access)
WHERE label = 'external_2';

INSERT INTO notifications(recipient_id, actor_id, type, message, entity_data)
SELECT external.profile_id,
       admin.profile_id,
       'task_updated',
       'linked context notification',
       jsonb_build_object(
         'taskId', 'd5000000-0000-4000-8000-000000000001',
         'contextTeamId', 'd2000000-0000-4000-8000-000000000001',
         'teamId', 'd2000000-0000-4000-8000-000000000001'
       )
FROM acl_test_actors external, acl_test_actors admin
WHERE external.label = 'external_2' AND admin.label = 'admin';
CREATE TEMP TABLE team_delete_revision_before AS
SELECT revision
FROM task_access_revisions
WHERE profile_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'external_2');

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ DELETE FROM teams WHERE id = 'd2000000-0000-4000-8000-000000000001' $$,
  'a full admin can delete a linked team without losing or blocking task comments'
);
RESET ROLE;
SELECT results_eq(
  $$
    SELECT context_team_id
    FROM task_comments
    WHERE id = 'd9000000-0000-4000-8000-000000000001'
  $$,
  $$ VALUES ('a2000000-0000-4000-8000-000000000001'::uuid) $$,
  'linked-context comments are remapped to their task home team'
);
SELECT results_eq(
  $$
    SELECT context_team_id, grants_access
    FROM task_comment_mentions
    WHERE comment_id = 'd9000000-0000-4000-8000-000000000001'
  $$,
  $$ VALUES ('a2000000-0000-4000-8000-000000000001'::uuid, true) $$,
  'duplicate home and linked mentions merge without losing grant semantics'
);
SELECT results_eq(
  $$
    SELECT context_team_id
    FROM task_access_grants
    WHERE task_id = 'd5000000-0000-4000-8000-000000000001'
      AND source_type = 'comment_mention'
      AND source_id = 'd9000000-0000-4000-8000-000000000001'
  $$,
  $$ VALUES ('a2000000-0000-4000-8000-000000000001'::uuid) $$,
  'remapped structured mentions retain access only in the home context'
);
SELECT results_eq(
  $$
    SELECT entity_data ->> 'contextTeamId', entity_data ->> 'teamId'
    FROM notifications
    WHERE message = 'linked context notification'
  $$,
  $$ VALUES (
       'a2000000-0000-4000-8000-000000000001'::text,
       'a2000000-0000-4000-8000-000000000001'::text
     ) $$,
  'task notification links are remapped to the surviving home context'
);
SELECT is(
  (
    SELECT current_row.revision > before_row.revision
    FROM task_access_revisions current_row
    CROSS JOIN team_delete_revision_before before_row
    WHERE current_row.profile_id = (
      SELECT profile_id FROM acl_test_actors WHERE label = 'external_2'
    )
  ),
  true,
  'linked-context revoke and home-context grant advance the external revision stream'
);

-- Admin conversion is atomic, clears/restores teams, and keeps latent permissions.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    SELECT set_member_access_scope(
      (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
      'full',
      ARRAY['a2000000-0000-4000-8000-000000000001'::uuid],
      'user'
    )
  $$,
  'admin converts an external collaborator to full access with a team'
);
SELECT lives_ok(
  $$
    SELECT set_member_access_scope(
      (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1'),
      'related_only',
      '{}'::uuid[],
      'user'
    )
  $$,
  'admin converts the member back to external atomically'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM team_members WHERE profile_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1')),
  0,
  'external conversion clears all team memberships'
);
SELECT is(
  (SELECT can_create FROM permissions WHERE member_id = (SELECT profile_id FROM acl_test_actors WHERE label = 'external_1')),
  true,
  'conversion preserves latent permission settings'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$
    SELECT set_member_access_scope(
      (SELECT profile_id FROM acl_test_actors WHERE label = 'admin'),
      'related_only',
      '{}'::uuid[],
      'user'
    )
  $$,
  'P0001',
  'The last full-access admin cannot be demoted',
  'the last full-access admin is protected from lockout'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
