-- Task start date.
--
-- Tasks now carry three dates: created_at (automatic), start_date (planned start, new) and
-- due_date (planned finish, shown to users as "Due date"). Together they prepare for a Gantt
-- view and for tracking how busy shared creative people (designers, video editors) are across
-- teams. done_date stays as the automatic completion stamp (Dashboard stats, late/on-time
-- labels) but is no longer shown or edited in the UI.
--
-- Purely additive: the client detects whether this column exists and hides the Start date UI
-- until it does, so this migration can be applied before or after the client ships.
-- No start <= due CHECK constraint on purpose: tabs still running an older build can move a
-- due date without knowing the start date, and must not start failing to save. The client
-- validates the order instead.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date date;

COMMENT ON COLUMN public.tasks.start_date IS 'Planned start of work (user-set). due_date is the planned finish.';
COMMENT ON COLUMN public.tasks.done_date IS 'Automatic completion stamp, set when the task enters a completed status. Not user-editable in the UI.';

-- save_task_with_relations (and save_task_with_subtasks, which calls it) learn start_date.
-- Same signature, so CREATE OR REPLACE keeps the existing REVOKE/GRANT privileges.
CREATE OR REPLACE FUNCTION public.save_task_with_relations(
  p_task jsonb,
  p_assignee_ids uuid[] DEFAULT '{}'::uuid[],
  p_placement_names text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task_id uuid;
  v_team_id uuid;
  v_invalid_count integer;
  v_can_mutate_placements boolean;
  v_existing_placement_names text[];
  v_requested_placement_names text[];
BEGIN
  IF NOT public.is_full_access() THEN
    RAISE EXCEPTION 'External collaborators cannot modify tasks';
  END IF;

  v_task_id := COALESCE(public.try_uuid(p_task ->> 'id'), gen_random_uuid());
  v_team_id := public.try_uuid(p_task ->> 'team_id');
  IF v_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.teams WHERE id = v_team_id) THEN
    RAISE EXCEPTION 'A valid team_id is required';
  END IF;
  IF btrim(COALESCE(p_task ->> 'title', '')) = '' THEN
    RAISE EXCEPTION 'Task title is required';
  END IF;

  v_can_mutate_placements := public.is_editor() OR v_team_id = (
    SELECT ap.team_id FROM public.auth_profile() ap
  );
  SELECT COALESCE(array_agg(DISTINCT p.name ORDER BY p.name), '{}'::text[])
  INTO v_existing_placement_names
  FROM public.task_placements tp
  JOIN public.placements p ON p.id = tp.placement_id
  WHERE tp.task_id = v_task_id;
  SELECT COALESCE(array_agg(name ORDER BY name), '{}'::text[])
  INTO v_requested_placement_names
  FROM (
    SELECT DISTINCT requested.name
    FROM unnest(COALESCE(p_placement_names, '{}'::text[])) requested(name)
    WHERE requested.name <> ''
  ) normalized;
  IF NOT v_can_mutate_placements
     AND v_existing_placement_names IS DISTINCT FROM v_requested_placement_names THEN
    RAISE EXCEPTION 'You cannot change placements for a task outside your team';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (SELECT DISTINCT unnest(COALESCE(p_assignee_ids, '{}'::uuid[])) AS id) requested
  LEFT JOIN public.profiles p ON p.id = requested.id
  WHERE p.id IS NULL;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'One or more assignees do not exist';
  END IF;

  IF NOT public.is_editor() AND EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_placement_names, '{}'::text[])) requested(name)
    LEFT JOIN public.placements p ON p.name = requested.name
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Only editors can create new placements';
  END IF;

  INSERT INTO public.tasks(
    id, title, description, team_id, status_id, priority, start_date, due_date, done_date,
    content_type, notes, editor_ids, designer_ids, links, files,
    custom_field_values, sort_order
  ) VALUES (
    v_task_id,
    p_task ->> 'title',
    COALESCE(p_task ->> 'description', ''),
    v_team_id,
    public.try_uuid(p_task ->> 'status_id'),
    COALESCE(NULLIF(p_task ->> 'priority', ''), 'medium'),
    NULLIF(p_task ->> 'start_date', '')::date,
    NULLIF(p_task ->> 'due_date', '')::date,
    NULLIF(p_task ->> 'done_date', '')::date,
    NULLIF(p_task ->> 'content_type', ''),
    NULLIF(p_task ->> 'notes', ''),
    COALESCE(p_task -> 'editor_ids', '[]'::jsonb),
    COALESCE(p_task -> 'designer_ids', '[]'::jsonb),
    COALESCE(p_task -> 'links', '[]'::jsonb),
    COALESCE(p_task -> 'files', '[]'::jsonb),
    COALESCE(p_task -> 'custom_field_values', '{}'::jsonb),
    COALESCE((p_task ->> 'sort_order')::integer, 0)
  )
  ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      team_id = EXCLUDED.team_id,
      status_id = EXCLUDED.status_id,
      priority = EXCLUDED.priority,
      -- Only overwrite start_date when the caller sent the key: a tab still running a build
      -- from before this migration omits it and must not wipe a start date set elsewhere.
      start_date = CASE WHEN p_task ? 'start_date' THEN EXCLUDED.start_date ELSE tasks.start_date END,
      due_date = EXCLUDED.due_date,
      done_date = EXCLUDED.done_date,
      content_type = EXCLUDED.content_type,
      notes = EXCLUDED.notes,
      editor_ids = EXCLUDED.editor_ids,
      designer_ids = EXCLUDED.designer_ids,
      links = EXCLUDED.links,
      files = EXCLUDED.files,
      custom_field_values = EXCLUDED.custom_field_values,
      sort_order = EXCLUDED.sort_order;

  DELETE FROM public.task_assignees a
  WHERE a.task_id = v_task_id
    AND NOT (a.member_id = ANY(COALESCE(p_assignee_ids, '{}'::uuid[])));

  INSERT INTO public.task_assignees(task_id, member_id, sort_order)
  SELECT v_task_id, requested.member_id, min(requested.ordinality)::integer - 1
  FROM unnest(COALESCE(p_assignee_ids, '{}'::uuid[])) WITH ORDINALITY
       AS requested(member_id, ordinality)
  GROUP BY requested.member_id
  ON CONFLICT (task_id, member_id) DO UPDATE
  SET sort_order = EXCLUDED.sort_order;

  IF v_can_mutate_placements THEN
    IF public.is_editor() THEN
      INSERT INTO public.placements(name)
      SELECT DISTINCT btrim(name)
      FROM unnest(COALESCE(p_placement_names, '{}'::text[])) requested(name)
      WHERE btrim(name) <> ''
      ON CONFLICT (name) DO NOTHING;
    END IF;

    DELETE FROM public.task_placements tp
    WHERE tp.task_id = v_task_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.placements p
        WHERE p.id = tp.placement_id
          AND p.name = ANY(COALESCE(p_placement_names, '{}'::text[]))
      );

    INSERT INTO public.task_placements(task_id, placement_id)
    SELECT DISTINCT v_task_id, p.id
    FROM public.placements p
    WHERE p.name = ANY(COALESCE(p_placement_names, '{}'::text[]))
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.rebuild_task_access_grants(v_task_id);
  RETURN v_task_id;
END;
$$;

