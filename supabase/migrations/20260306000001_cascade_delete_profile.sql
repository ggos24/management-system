-- Allow deleting auth users by cascading to profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_auth_user_id_fkey,
  ADD CONSTRAINT profiles_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
