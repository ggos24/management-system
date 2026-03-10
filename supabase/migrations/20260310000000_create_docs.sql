CREATE TABLE docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES docs(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('help', 'knowledge-base')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  content_html TEXT DEFAULT '',
  is_folder BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique slug per section+parent
CREATE UNIQUE INDEX idx_docs_slug ON docs(section, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), slug);
CREATE INDEX idx_docs_parent ON docs(parent_id);
CREATE INDEX idx_docs_section ON docs(section);

-- Full-text search
ALTER TABLE docs ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content_html, '')), 'B')
  ) STORED;
CREATE INDEX idx_docs_search ON docs USING GIN(search_vector);

-- RLS: everyone reads, admins mutate
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY docs_select ON docs FOR SELECT TO authenticated USING (true);
CREATE POLICY docs_insert ON docs FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY docs_update ON docs FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY docs_delete ON docs FOR DELETE TO authenticated USING (is_admin());

-- Auto-update updated_at
CREATE TRIGGER docs_updated_at BEFORE UPDATE ON docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
