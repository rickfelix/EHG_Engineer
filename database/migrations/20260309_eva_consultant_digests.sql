-- Migration: Create eva_consultant_digests table
-- Date: 2026-03-09
-- Purpose: Store daily EVA consultant digest summaries with metrics and source health

-- =============================================================================
-- Table: eva_consultant_digests
-- =============================================================================
CREATE TABLE IF NOT EXISTS eva_consultant_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date DATE NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  source_health_summary JSONB DEFAULT '{}',
  generated_by TEXT DEFAULT 'chairman-digest.mjs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eva_consultant_digests IS 'Daily EVA consultant digest summaries containing aggregated metrics, source health, and narrative content';
COMMENT ON COLUMN eva_consultant_digests.digest_date IS 'The date this digest covers (one digest per day)';
COMMENT ON COLUMN eva_consultant_digests.content IS 'JSONB digest narrative content and structured sections';
COMMENT ON COLUMN eva_consultant_digests.metrics IS 'JSONB aggregated metrics for the digest period';
COMMENT ON COLUMN eva_consultant_digests.source_health_summary IS 'JSONB health status of data sources used to generate the digest';
COMMENT ON COLUMN eva_consultant_digests.generated_by IS 'Script or process that generated this digest';

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_eva_consultant_digests_date
  ON eva_consultant_digests (digest_date DESC);

-- =============================================================================
-- RLS: Enable Row Level Security
-- =============================================================================
ALTER TABLE eva_consultant_digests ENABLE ROW LEVEL SECURITY;

-- Service role: full CRUD access
CREATE POLICY service_role_full_access ON eva_consultant_digests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon: SELECT only
CREATE POLICY anon_select_only ON eva_consultant_digests
  FOR SELECT
  TO anon
  USING (true);

-- =============================================================================
-- Rollback SQL (for reference):
-- DROP POLICY IF EXISTS anon_select_only ON eva_consultant_digests;
-- DROP POLICY IF EXISTS service_role_full_access ON eva_consultant_digests;
-- DROP INDEX IF EXISTS idx_eva_consultant_digests_date;
-- DROP TABLE IF EXISTS eva_consultant_digests;
-- =============================================================================
