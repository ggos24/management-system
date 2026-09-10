-- Birthdays on profiles.
--
-- One nullable date column. The birth year is optional: a member who is happy
-- to be congratulated but not to publish their age is stored with the sentinel
-- year 1904, which the client renders as "14 March" and never turns into an
-- age. 1904 is a leap year on purpose — 1900 is not, so a 29 February birthday
-- could not be stored under it at all.
--
-- profiles carries no UPDATE policy: every write already goes through a
-- SECURITY DEFINER RPC, so the column needs two doors. Members set their own
-- birthday through update_own_profile; admins set anyone's through
-- set_member_birthday.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday date;

COMMENT ON COLUMN public.profiles.birthday IS
  'Date of birth. The sentinel year 1904 means only the day and month were shared.';

-- Adding parameters to an existing function creates an overload rather than
-- replacing it, and the three-argument call would then be ambiguous.
DROP FUNCTION IF EXISTS public.update_own_profile(text, text, text);

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_avatar text DEFAULT NULL,
  p_birthday date DEFAULT NULL,
  p_clear_birthday boolean DEFAULT false
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF p_name IS NOT NULL AND (btrim(p_name) = '' OR length(p_name) > 100) THEN
    RAISE EXCEPTION 'Name must be between 1 and 100 characters';
  END IF;
  IF p_job_title IS NOT NULL AND length(p_job_title) > 100 THEN
    RAISE EXCEPTION 'Job title must be 100 characters or fewer';
  END IF;
  IF p_birthday IS NOT NULL AND (p_birthday > current_date OR EXTRACT(YEAR FROM p_birthday) < 1904) THEN
    RAISE EXCEPTION 'Birthday must be a past date in 1904 or later';
  END IF;

  UPDATE public.profiles p
  SET name = COALESCE(p_name, p.name),
      job_title = COALESCE(p_job_title, p.job_title),
      avatar = COALESCE(p_avatar, p.avatar),
      -- COALESCE alone can never blank a column, so removing a birthday needs
      -- its own flag rather than a NULL argument.
      birthday = CASE WHEN p_clear_birthday THEN NULL ELSE COALESCE(p_birthday, p.birthday) END
  WHERE p.auth_user_id = auth.uid()
  RETURNING p.* INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  RETURN v_profile;
END;
$$;

-- Most people never open Settings. An admin filling the team's birthdays in one
-- sitting is the path that actually populates this column.
CREATE OR REPLACE FUNCTION public.set_member_birthday(
  p_profile_id uuid,
  p_birthday date DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() OR NOT public.is_full_access() THEN
    RAISE EXCEPTION 'Only full-access admins can set another member''s birthday';
  END IF;
  IF p_birthday IS NOT NULL AND (p_birthday > current_date OR EXTRACT(YEAR FROM p_birthday) < 1904) THEN
    RAISE EXCEPTION 'Birthday must be a past date in 1904 or later';
  END IF;

  -- NULL clears: an explicit setter has no other way to say "remove it".
  UPDATE public.profiles p
  SET birthday = p_birthday
  WHERE p.id = p_profile_id
  RETURNING p.* INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(text, text, text, date, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, date, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_member_birthday(uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_birthday(uuid, date) TO authenticated;

COMMIT;
