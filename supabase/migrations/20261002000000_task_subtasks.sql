-- Structured subtasks are independent of checklists in a task description.
CREATE TABLE public.task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  start_date date,
  end_date date,
  completed boolean NOT NULL DEFAULT false,
  CONSTRAINT task_subtasks_date_order CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX task_subtasks_task_order_idx ON public.task_subtasks(task_id, created_at, id);
CREATE INDEX task_subtasks_assignee_idx ON public.task_subtasks(assignee_id) WHERE assignee_id IS NOT NULL;

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_subtasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_subtasks TO authenticated;

CREATE POLICY task_subtasks_select ON public.task_subtasks
  FOR SELECT TO authenticated
  USING (public.is_full_access() OR public.has_related_task_access(task_id));
CREATE POLICY task_subtasks_insert ON public.task_subtasks
  FOR INSERT TO authenticated WITH CHECK (public.is_full_access());
CREATE POLICY task_subtasks_update ON public.task_subtasks
  FOR UPDATE TO authenticated
  USING (public.is_full_access()) WITH CHECK (public.is_full_access());
CREATE POLICY task_subtasks_delete ON public.task_subtasks
  FOR DELETE TO authenticated USING (public.is_full_access());

-- Restricted collaborators can change exactly one field on their own assigned row.
CREATE FUNCTION public.set_task_subtask_completion(p_subtask_id uuid, p_completed boolean)
RETURNS public.task_subtasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_subtask public.task_subtasks;
BEGIN
  IF p_completed IS NULL THEN RAISE EXCEPTION 'Completion state is required'; END IF;
  SELECT s.* INTO v_subtask
  FROM public.task_subtasks s
  JOIN public.tasks t ON t.id = s.task_id
  WHERE s.id = p_subtask_id AND t.deleted_at IS NULL
  FOR UPDATE OF s;
  IF NOT FOUND OR NOT (
    public.is_full_access()
    OR (
      v_subtask.assignee_id = public.current_profile_id()
      AND public.has_related_task_access(v_subtask.task_id)
    )
  ) THEN
    RAISE EXCEPTION 'Subtask unavailable';
  END IF;
  UPDATE public.task_subtasks SET completed = p_completed
  WHERE id = p_subtask_id RETURNING * INTO v_subtask;
  RETURN v_subtask;
END;
$$;
REVOKE ALL ON FUNCTION public.set_task_subtask_completion(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_subtask_completion(uuid, boolean) TO authenticated;

-- Keep initial task + draft subtasks in one transaction without changing the
-- existing task RPC signature used by already deployed clients.
CREATE FUNCTION public.save_task_with_subtasks(
  p_task jsonb,
  p_assignee_ids uuid[],
  p_placement_names text[],
  p_subtasks jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_task_id uuid;
  v_item jsonb;
BEGIN
  IF NOT public.is_full_access() THEN RAISE EXCEPTION 'Task unavailable'; END IF;
  IF jsonb_typeof(p_subtasks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Subtasks must be an array';
  END IF;
  v_task_id := public.save_task_with_relations(p_task, p_assignee_ids, p_placement_names);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_subtasks) LOOP
    INSERT INTO public.task_subtasks (id, task_id, title, assignee_id, start_date, end_date, completed)
    VALUES (
      (v_item ->> 'id')::uuid,
      v_task_id,
      btrim(v_item ->> 'title'),
      NULLIF(v_item ->> 'assigneeId', '')::uuid,
      NULLIF(v_item ->> 'startDate', '')::date,
      NULLIF(v_item ->> 'endDate', '')::date,
      COALESCE((v_item ->> 'completed')::boolean, false)
    );
  END LOOP;
  RETURN v_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_task_with_subtasks(jsonb, uuid[], text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_task_with_subtasks(jsonb, uuid[], text[], jsonb) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_subtasks;
