-- Per-user, per-channel notification preferences (opt-out model: absence of row = enabled).
-- Replaces the global profiles.email_notifications flag with per-category control across
-- in-app, Telegram, and email channels.

CREATE TABLE notification_preferences (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('tasks', 'deadlines', 'mentions', 'schedule', 'members')),
  channel text NOT NULL CHECK (channel IN ('in_app', 'telegram', 'email')),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category, channel)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Senders need to read every recipient's prefs to filter dispatch; prefs are not sensitive.
CREATE POLICY "select all prefs" ON notification_preferences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "insert own prefs" ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "update own prefs" ON notification_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "delete own prefs" ON notification_preferences FOR DELETE
  TO authenticated
  USING (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Backfill: anyone who had email_notifications = false gets opt-out rows for every
-- category on the email channel, preserving their preference.
INSERT INTO notification_preferences (user_id, category, channel, enabled)
SELECT p.id, c.category, 'email', false
FROM profiles p
CROSS JOIN (VALUES ('tasks'), ('deadlines'), ('mentions'), ('schedule'), ('members')) AS c(category)
WHERE p.email_notifications = false
ON CONFLICT DO NOTHING;

ALTER TABLE profiles DROP COLUMN email_notifications;
