-- Storage bucket for weekly-digest email images (optimized covers + author headshots).
-- Public bucket so the images load in any email client. Files are written by the
-- `optimize-images` edge function via the service role (which bypasses RLS); the
-- admin INSERT/DELETE policies below cover any direct client access.
--
-- Background: SendPulse has no public API that returns a usable image URL (its File
-- Manager POST /file returns only {success,message}), so optimized assets are self-hosted
-- here instead. In a sent email this is functionally identical to SendPulse-hosted images.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-assets',
  'email-assets',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Only admins upload/replace email assets (the tool itself is admin-only)
CREATE POLICY "Admins can upload email assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-assets' AND is_admin());

CREATE POLICY "Admins can update email assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'email-assets' AND is_admin());

-- Public read access (emails embed these URLs)
CREATE POLICY "Public read access for email assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'email-assets');

-- Admins can delete email assets
CREATE POLICY "Admins can delete email assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'email-assets' AND is_admin());
