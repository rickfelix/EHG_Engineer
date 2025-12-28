-- Migration: Audit Finding to SD Mapping
-- Date: 2025-12-28
-- Purpose: Create infrastructure for tracking audit findings through to SD creation
-- Triangulation Source: Claude Code + OpenAI ChatGPT + Google Antigravity consensus

-- ============================================================================
-- 1. Create disposition enum for audit finding triage
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE audit_disposition AS ENUM (
    'pending',           -- Not yet triaged
    'sd_created',        -- SD was created for this finding
    'deferred',          -- Valid but not addressing now
    'wont_fix',          -- Decided not to address
    'duplicate',         -- Duplicate of another finding
    'needs_discovery'    -- Requires investigation/spike first
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. Main audit finding mapping table
-- ============================================================================
-- Stores every finding from runtime audits with traceability to source
-- Key invariant: original_issue_id is immutable (NAV-xx format)
CREATE TABLE IF NOT EXISTS audit_finding_sd_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source tracking (immutable after ingestion)
  audit_file_path TEXT NOT NULL,                    -- e.g., 'docs/audits/2025-12-26-navigation-audit.md'
  original_issue_id VARCHAR(20) NOT NULL,           -- e.g., 'NAV-17' (NEVER changes)
  audit_date DATE NOT NULL,
  source_line_number INTEGER,                       -- Line number in markdown file

  -- Ingestion fingerprint (immutable - prevents duplicate ingestion)
  audit_content_hash VARCHAR(64),                   -- SHA256 of source content
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  ingested_by VARCHAR(100),

  -- Chairman's exact words (immutable - verbatim preservation)
  verbatim_text TEXT NOT NULL,                      -- Exact quote from audit
  issue_type VARCHAR(20) NOT NULL,                  -- 'bug', 'ux', 'brainstorm', 'theme'
  severity VARCHAR(20),                             -- 'critical', 'major', 'minor', 'idea'
  route_path TEXT,                                  -- e.g., '/chairman/decisions'

  -- Duplicate tracking
  duplicate_of_issue_id VARCHAR(20),                -- If this is a duplicate of another finding

  -- Triage decision (mutable)
  disposition audit_disposition NOT NULL DEFAULT 'pending',
  disposition_reason TEXT,                          -- Why this decision was made
  disposition_by VARCHAR(100),                      -- Who/what made the decision
  disposition_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(audit_file_path, original_issue_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_mapping_disposition
  ON audit_finding_sd_mapping(disposition);
CREATE INDEX IF NOT EXISTS idx_audit_mapping_file
  ON audit_finding_sd_mapping(audit_file_path);
CREATE INDEX IF NOT EXISTS idx_audit_mapping_hash
  ON audit_finding_sd_mapping(audit_content_hash);
CREATE INDEX IF NOT EXISTS idx_audit_mapping_issue_type
  ON audit_finding_sd_mapping(issue_type);
CREATE INDEX IF NOT EXISTS idx_audit_mapping_severity
  ON audit_finding_sd_mapping(severity);

-- ============================================================================
-- 3. SD link join table (many-to-many relationship)
-- ============================================================================
-- Supports:
-- - One finding → one SD (primary)
-- - One finding → multiple SDs (supporting)
-- - Multiple findings → one SD (theme)
CREATE TABLE IF NOT EXISTS audit_finding_sd_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  mapping_id UUID NOT NULL REFERENCES audit_finding_sd_mapping(id) ON DELETE CASCADE,
  sd_id VARCHAR(50) NOT NULL,                       -- References strategic_directives_v2.id

  link_type VARCHAR(20) NOT NULL DEFAULT 'primary',
    -- 'primary': Direct 1:1 mapping (bug → fix SD)
    -- 'supporting': This finding supports a larger SD
    -- 'theme': This finding is grouped under a Theme SD

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(mapping_id, sd_id)
);

-- Indexes for join table
CREATE INDEX IF NOT EXISTS idx_sd_links_mapping
  ON audit_finding_sd_links(mapping_id);
CREATE INDEX IF NOT EXISTS idx_sd_links_sd
  ON audit_finding_sd_links(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_links_type
  ON audit_finding_sd_links(link_type);

-- ============================================================================
-- 4. Update sd_type constraint for new SD types
-- ============================================================================
-- Add new SD types for non-coding work (from triangulation recommendations)
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_sd_type_check;

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_sd_type_check
CHECK (sd_type IS NULL OR sd_type IN (
  -- Existing types
  'orchestrator',
  'implementation',
  'documentation',

  -- New types (from triangulated consensus)
  'strategic_observation',   -- Chairman insights about product direction
  'architectural_review',    -- Cross-cutting themes requiring holistic analysis
  'discovery_spike',         -- Time-boxed "first principles" investigation
  'ux_debt',                 -- UX issues that aren't bugs
  'product_decision'         -- Decisions needed before implementation
));

-- ============================================================================
-- 5. Coverage report view
-- ============================================================================
-- Provides at-a-glance audit coverage metrics
CREATE OR REPLACE VIEW audit_coverage_report AS
SELECT
  audit_file_path,
  audit_date,
  COUNT(*) as total_issues,
  COUNT(*) FILTER (WHERE disposition = 'pending') as pending,
  COUNT(*) FILTER (WHERE disposition = 'sd_created') as sd_created,
  COUNT(*) FILTER (WHERE disposition = 'deferred') as deferred,
  COUNT(*) FILTER (WHERE disposition = 'wont_fix') as wont_fix,
  COUNT(*) FILTER (WHERE disposition = 'duplicate') as duplicate,
  COUNT(*) FILTER (WHERE disposition = 'needs_discovery') as needs_discovery,
  ROUND(100.0 * COUNT(*) FILTER (WHERE disposition != 'pending') / NULLIF(COUNT(*), 0), 1) as coverage_pct
FROM audit_finding_sd_mapping
GROUP BY audit_file_path, audit_date
ORDER BY audit_date DESC;

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================
ALTER TABLE audit_finding_sd_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_finding_sd_links ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read audit mappings"
  ON audit_finding_sd_mapping FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read audit links"
  ON audit_finding_sd_links FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access
CREATE POLICY "Service role has full access to audit mappings"
  ON audit_finding_sd_mapping FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to audit links"
  ON audit_finding_sd_links FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7. Updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_audit_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_mapping_updated_at ON audit_finding_sd_mapping;
CREATE TRIGGER trigger_audit_mapping_updated_at
  BEFORE UPDATE ON audit_finding_sd_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_mapping_updated_at();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE audit_finding_sd_mapping IS
  'Maps runtime audit findings to Strategic Directives with full traceability.
   Created from triangulated recommendations (Claude + OpenAI + Antigravity).
   Key invariant: original_issue_id is immutable - verbatim Chairman feedback preserved.';

COMMENT ON TABLE audit_finding_sd_links IS
  'Join table supporting many-to-many relationships between audit findings and SDs.
   Supports primary (1:1), supporting (N:1), and theme (N:1) link types.';

COMMENT ON VIEW audit_coverage_report IS
  'Aggregated coverage metrics per audit file. Used for zero-loss gate enforcement.
   Target: 100% coverage (no pending items) before audit closure.';
