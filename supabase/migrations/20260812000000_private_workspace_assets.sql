-- Post-client enforcement migration.
--
-- Apply only after deploying the client that renders private workspace assets
-- through authenticated/signed URLs. Keeping this separate from the additive
-- External collaborator schema migration prevents existing public asset URLs
-- from breaking during the rollout window.

BEGIN;

-- Docs and support attachments may contain private workspace data. Ensure the
-- buckets are private even on fresh databases (docs-assets was historically
-- provisioned through the dashboard), remove public reads, and expose objects
-- only to full-access authenticated users. Existing admin delete policies stay
-- unchanged.
INSERT INTO storage.buckets(id, name, public)
VALUES
  ('docs-assets', 'docs-assets', false),
  ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

-- Hosted Supabase owns this table as supabase_storage_admin and requires that
-- ownership to remain unchanged. The platform already enables RLS and supports
-- project-managed policies on storage.objects, but ALTER TABLE itself is an
-- owner-only operation. Fail clearly and atomically if the platform invariant
-- is ever missing instead of attempting ownership or role-membership changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND relation.relkind IN ('r', 'p')
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'storage.objects must have RLS enabled by the Supabase platform before applying this migration'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Public read access for doc assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Full users can read doc assets" ON storage.objects;
DROP POLICY IF EXISTS "Full users can read ticket attachments" ON storage.objects;
CREATE POLICY "Full users can read doc assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'docs-assets' AND public.is_full_access());
CREATE POLICY "Full users can read ticket attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ticket-attachments' AND public.is_full_access());

DROP POLICY IF EXISTS "Authenticated users can upload doc assets" ON storage.objects;
DROP POLICY IF EXISTS "Editors can upload doc assets" ON storage.objects;
DROP POLICY IF EXISTS "Full users can upload doc assets" ON storage.objects;
CREATE POLICY "Full users can upload doc assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'docs-assets' AND public.is_full_access());

DROP POLICY IF EXISTS "Authenticated users can upload ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Full users can upload ticket attachments" ON storage.objects;
CREATE POLICY "Full users can upload ticket attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments' AND public.is_full_access());

COMMIT;
