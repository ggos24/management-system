-- Restore Realtime for the tables `hooks/useRealtimeSync.ts` subscribes to.
--
-- Postgres Changes only delivers events for tables that are members of the
-- `supabase_realtime` publication. Production held just the seven tables that
-- past migrations added explicitly (notifications, task_access_revisions,
-- team_hidden_columns, team_members, team_person_field_config, tickets,
-- ticket_comments) — every other subscription in useRealtimeSync attached
-- successfully and then silently received nothing.
--
-- The visible symptom: a schedule absence created on one client never reached
-- sessions that were already open, so the same day rendered as an absence badge
-- for some accounts and as the underlying shift hours for others until a full
-- page reload. The same gap left the Kanban board stale between reloads.
--
-- Idempotent: ADD TABLE errors when the table is already a publication member,
-- so each table is checked first.

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'tasks',
    'profiles',
    'absences',
    'shifts',
    'task_comments',
    'task_team_links',
    'team_statuses',
    'team_placements'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END;
$$;
