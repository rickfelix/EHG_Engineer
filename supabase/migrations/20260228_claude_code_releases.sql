-- Claude Code Release Monitor table
-- Stores detected Claude Code releases from npm registry
-- Part of SD-LEO-INFRA-IMPLEMENT-CLAUDE-CODE-001

CREATE TABLE IF NOT EXISTS claude_code_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  release_date TIMESTAMPTZ,
  changelog_url TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'applied')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent duplicate version entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_claude_code_releases_version
  ON claude_code_releases (version);

-- RLS policies
ALTER TABLE claude_code_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access on claude_code_releases"
  ON claude_code_releases FOR ALL
  USING (true)
  WITH CHECK (true);
