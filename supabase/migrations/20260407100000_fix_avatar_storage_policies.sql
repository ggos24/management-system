-- Fix avatar bucket: increase size limit to 10 MB, allow all image MIME types,
-- and fix storage policies to use profiles.id instead of auth.uid().

-- 1. Update bucket settings
UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = ARRAY['image/*']
WHERE id = 'avatars';

-- 2. Drop all existing avatar policies (originals + dashboard-added)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public avatar read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own avatar" ON storage.objects;

-- 3. Recreate with correct profile ID matching
-- Files are stored as avatars/{profiles.id}.{ext}, NOT auth.uid()

CREATE POLICY "Authenticated users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND storage.filename(name) ~~ (
    (SELECT id FROM profiles WHERE auth_user_id = auth.uid())::text || '.%'
  )
);

CREATE POLICY "Authenticated users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND storage.filename(name) ~~ (
    (SELECT id FROM profiles WHERE auth_user_id = auth.uid())::text || '.%'
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND storage.filename(name) ~~ (
    (SELECT id FROM profiles WHERE auth_user_id = auth.uid())::text || '.%'
  )
);

CREATE POLICY "Authenticated users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND storage.filename(name) ~~ (
    (SELECT id FROM profiles WHERE auth_user_id = auth.uid())::text || '.%'
  )
);

CREATE POLICY "Public avatar read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
