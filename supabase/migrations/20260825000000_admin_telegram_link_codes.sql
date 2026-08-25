-- Admin-initiated Telegram link codes.
--
-- The Mini App identifies a Telegram account, and mapping it to a profile needs
-- a telegram_links row. The only way to create one today starts in the web app's
-- Settings — exactly where the people who live in Telegram never go. That is
-- circular, and it shows: 6 of 56 internal profiles are linked.
--
-- telegram_links RLS is strictly self-scoped (see 20260811000000), so an admin
-- cannot issue a code on someone's behalf through the table. This function is the
-- narrow, audited exception.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_generate_telegram_link_code(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT public.is_admin() OR NOT public.is_full_access() THEN
    RAISE EXCEPTION 'Only full-access admins can issue link codes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND access_scope = 'full') THEN
    RAISE EXCEPTION 'Profile not found or not an internal member';
  END IF;

  -- Six uppercase alphanumerics, matching what the /start CODE webhook expects.
  -- Ambiguous glyphs are excluded: these get read aloud and retyped by hand.
  -- link_code is UNIQUE, so retry rather than leaving a rare random failure.
  FOR i IN 1..10 LOOP
    SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
    INTO v_code
    FROM generate_series(1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.telegram_links WHERE link_code = v_code);
    v_code := NULL;
  END LOOP;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Could not allocate a unique link code';
  END IF;

  -- Clearing chat_id is what makes this double as a re-link path: the webhook
  -- refuses /start CODE while a chat is still attached, which would otherwise
  -- strand anyone who changed Telegram accounts.
  INSERT INTO public.telegram_links (profile_id, link_code, chat_id, linked_at)
  VALUES (p_profile_id, v_code, NULL, NULL)
  ON CONFLICT (profile_id)
  DO UPDATE SET link_code = EXCLUDED.link_code, chat_id = NULL, linked_at = NULL;

  RETURN v_code;
END;
$$;

COMMIT;
