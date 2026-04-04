-- Add email notification preference to profiles (enabled by default)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_notifications boolean DEFAULT true;
