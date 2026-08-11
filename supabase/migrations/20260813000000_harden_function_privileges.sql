-- Additive Security Advisor follow-up.
-- Trigger execution is performed by PostgreSQL and does not depend on API-role
-- EXECUTE grants. Remove direct invocation of SECURITY DEFINER trigger helpers
-- while leaving their trigger bindings unchanged.

BEGIN;

REVOKE ALL ON FUNCTION public.after_profile_access_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_access_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_task_mention_consistency()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_task_access_grant_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_grants_for_custom_property()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_grants_for_task_child()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_grants_for_task_row()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_external_team_membership()
  FROM PUBLIC, anon, authenticated;

-- Pin lookup paths without changing function bodies or execution mode. The
-- self-link trigger reads public.tasks; the other helpers use only pg_catalog
-- built-ins. No temporary or caller-controlled schema participates in lookup.
ALTER FUNCTION public.prevent_self_team_link()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_updated_at()
  SET search_path = pg_catalog;
ALTER FUNCTION public.try_uuid(text)
  SET search_path = pg_catalog;

COMMIT;
