-- Create avatars storage bucket (public, 2 MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'avatars'
);

-- Allow authenticated users to update (overwrite) their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

-- Public read access for avatars
CREATE POLICY "Public avatar read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
