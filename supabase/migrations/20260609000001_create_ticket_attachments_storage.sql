-- Storage bucket for support-ticket attachments (screenshots, logs, etc.).
-- Public bucket (like docs-assets); files are stored under unguessable UUID paths.
-- If attachment privacy becomes a concern, switch to a private bucket + signed URLs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  true,
  26214400,  -- 25 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'application/zip',
    'video/mp4', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload attachments
CREATE POLICY "Authenticated users can upload ticket attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments');

-- Public read access (URLs are unguessable UUID paths)
CREATE POLICY "Public read access for ticket attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'ticket-attachments');

-- Allow admins to delete attachments
CREATE POLICY "Admins can delete ticket attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ticket-attachments' AND is_admin());
