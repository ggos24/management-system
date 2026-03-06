-- Auto-create a profile row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: create profiles for any existing auth users that don't have one
INSERT INTO public.profiles (auth_user_id, name, role)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), 'user'
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_user_id = u.id
WHERE p.id IS NULL;
