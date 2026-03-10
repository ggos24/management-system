-- Storage policies for docs-assets bucket
-- Bucket should already be created as public via Supabase dashboard

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload doc assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'docs-assets');

-- Allow public read access
CREATE POLICY "Public read access for doc assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'docs-assets');

-- Allow admins to delete
CREATE POLICY "Admins can delete doc assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'docs-assets' AND is_admin());
