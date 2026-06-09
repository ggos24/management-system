-- Support tickets: internal staff report technical problems with the product
-- (website, admin panel, account/access, other); admins triage, converse & resolve.

-- ===================
-- 1. tickets
-- ===================

CREATE TABLE tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL CHECK (category IN ('website', 'admin_panel', 'account_access', 'other')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_on_reporter', 'resolved', 'closed')),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_tickets_reporter ON tickets(reporter_id, created_at DESC);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_id);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
-- REPLICA IDENTITY FULL so Supabase realtime RLS filtering works (same as notifications)
ALTER TABLE tickets REPLICA IDENTITY FULL;

-- Reporters see their own tickets; admins see all (triage)
CREATE POLICY "Reporters and admins can select tickets"
  ON tickets FOR SELECT TO authenticated
  USING (is_admin() OR reporter_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Any authenticated user can file a ticket as themselves
CREATE POLICY "Users can insert own tickets"
  ON tickets FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Admins triage any ticket; reporters may update their own (reopen, edit while open)
CREATE POLICY "Reporters and admins can update tickets"
  ON tickets FOR UPDATE TO authenticated
  USING (is_admin() OR reporter_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- Only admins delete tickets
CREATE POLICY "Admins can delete tickets"
  ON tickets FOR DELETE TO authenticated
  USING (is_admin());

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===================
-- 2. ticket_comments (mirrors task_comments)
-- ===================

CREATE TABLE ticket_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_user_id ON ticket_comments(user_id);

ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments REPLICA IDENTITY FULL;

-- Comments are visible whenever the parent ticket is visible to the user
CREATE POLICY "Can select ticket_comments on visible tickets"
  ON ticket_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_id
      AND (is_admin() OR t.reporter_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
  ));

-- Users insert comments as themselves, only on tickets they can see
CREATE POLICY "Users can insert own ticket_comments"
  ON ticket_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_id
        AND (is_admin() OR t.reporter_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
    )
  );

-- Users edit/delete their own comments; admins any
CREATE POLICY "Users can update own ticket_comments"
  ON ticket_comments FOR UPDATE TO authenticated
  USING (is_admin() OR user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can delete own ticket_comments"
  ON ticket_comments FOR DELETE TO authenticated
  USING (is_admin() OR user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- ===================
-- 3. Realtime
-- ===================

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_comments;
