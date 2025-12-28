-- Migration: Audit Retrospective Schema
-- Date: 2025-12-28
-- Purpose: Add Phase 7 (Audit Retrospective) support to runtime audit protocol
-- Triangulation Source: Claude Code + OpenAI ChatGPT + Google Antigravity consensus

-- ============================================================================
-- 1. Runtime audits table (first-class audit entities)
-- ============================================================================
-- Track audits as first-class entities for metrics and retrospectives
CREATE TABLE IF NOT EXISTS runtime_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Audit identity
  audit_file_path TEXT NOT NULL UNIQUE,
  audit_date DATE NOT NULL,
  target_application VARCHAR(50) DEFAULT 'EHG',

  -- Coverage metrics (computed during triage)
  total_findings INTEGER,
  sd_created_count INTEGER,
  deferred_count INTEGER,
  wont_fix_count INTEGER,
  needs_discovery_count INTEGER,
  duplicate_count INTEGER,
  coverage_pct DECIMAL(5,2),

  -- Triangulation metrics
  triangulation_consensus_rate DECIMAL(5,2),
  verbatim_preservation_rate DECIMAL(5,2),

  -- Timing metrics
  time_to_triage_minutes INTEGER,
  time_to_sd_minutes INTEGER,

  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,  -- When retro completed

  -- Status tracking
  status VARCHAR(20) DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'triaged', 'sd_created', 'retro_complete', 'closed'))
);

-- Indexes for runtime_audits
CREATE INDEX IF NOT EXISTS idx_runtime_audits_status
  ON runtime_audits(status);
CREATE INDEX IF NOT EXISTS idx_runtime_audits_date
  ON runtime_audits(audit_date);
CREATE INDEX IF NOT EXISTS idx_runtime_audits_app
  ON runtime_audits(target_application);

-- ============================================================================
-- 2. Triangulation log table (preserve 3-model analysis per issue)
-- ============================================================================
-- Captures independent analysis from each AI model for traceability
CREATE TABLE IF NOT EXISTS audit_triangulation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to audit
  audit_id UUID REFERENCES runtime_audits(id) ON DELETE CASCADE,

  -- Issue reference (immutable)
  issue_id VARCHAR(50) NOT NULL,  -- NAV-xx format
  issue_verbatim TEXT,            -- Chairman's exact words

  -- 3-model analysis (immutable after capture)
  claude_analysis TEXT,
  chatgpt_analysis TEXT,
  antigravity_analysis TEXT,

  -- Consensus metrics
  consensus_score INTEGER CHECK (consensus_score BETWEEN 0 AND 100),
  consensus_type VARCHAR(20) CHECK (consensus_type IN ('HIGH', 'MEDIUM', 'LOW', 'DIVERGENT')),
  final_decision TEXT,

  -- Root cause (if triangulated)
  triangulated_root_cause TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(audit_id, issue_id)
);

-- Indexes for triangulation_log
CREATE INDEX IF NOT EXISTS idx_triangulation_audit
  ON audit_triangulation_log(audit_id);
CREATE INDEX IF NOT EXISTS idx_triangulation_issue
  ON audit_triangulation_log(issue_id);
CREATE INDEX IF NOT EXISTS idx_triangulation_consensus
  ON audit_triangulation_log(consensus_type);

-- ============================================================================
-- 3. Sub-agent contribution column (add to existing table)
-- ============================================================================
-- Allows sub-agents to contribute observations during SD execution
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'retro_contribution'
  ) THEN
    ALTER TABLE sub_agent_execution_results
    ADD COLUMN retro_contribution JSONB DEFAULT '{}'::jsonb;

    COMMENT ON COLUMN sub_agent_execution_results.retro_contribution IS
      'Sub-agent contribution to retrospective. JSON format:
       {
         "observation": "text",
         "severity": "HIGH/MEDIUM/LOW",
         "pattern_candidate": true/false,
         "suggested_action": "text",
         "evidence_ids": ["NAV-xx", ...]
       }';
  END IF;
END $$;

-- ============================================================================
-- 4. Retrospective contributions table (multi-voice contributions)
-- ============================================================================
-- Normalized table for contributions from various sources
CREATE TABLE IF NOT EXISTS retrospective_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to retrospective
  retro_id UUID REFERENCES retrospectives(id) ON DELETE CASCADE,

  -- Contributor identity
  contributor_type VARCHAR(30) NOT NULL
    CHECK (contributor_type IN ('triangulation_partner', 'sub_agent', 'chairman', 'system')),
  contributor_name VARCHAR(50) NOT NULL,  -- 'Claude', 'ChatGPT', 'Antigravity', 'DATABASE', etc.

  -- Structured contribution
  observations JSONB,      -- Array of atomic observations
  risks JSONB,             -- Array of identified risks
  recommendations JSONB,   -- Array of recommendations
  evidence_refs JSONB,     -- Array of NAV-xx, SD-xx references

  -- Metrics
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  scope VARCHAR(50),       -- What area this covers
  time_spent_minutes INTEGER,

  -- Raw text (optional backup)
  raw_text TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for retrospective_contributions
CREATE INDEX IF NOT EXISTS idx_retro_contributions_retro
  ON retrospective_contributions(retro_id);
CREATE INDEX IF NOT EXISTS idx_retro_contributions_contributor
  ON retrospective_contributions(contributor_type, contributor_name);
CREATE INDEX IF NOT EXISTS idx_retro_contributions_type
  ON retrospective_contributions(contributor_type);

-- ============================================================================
-- 5. Update retrospectives table for audit support
-- ============================================================================
-- Add AUDIT type to retro_type constraint
ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS retrospectives_retro_type_check;

ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_retro_type_check
CHECK (retro_type IS NULL OR retro_type IN ('SPRINT', 'SD_COMPLETION', 'INCIDENT', 'AUDIT'));

-- Add audit-specific columns
DO $$ BEGIN
  -- Add audit_id reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives'
    AND column_name = 'audit_id'
  ) THEN
    ALTER TABLE retrospectives
    ADD COLUMN audit_id UUID REFERENCES runtime_audits(id);
  END IF;

  -- Add triangulation divergence insights
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives'
    AND column_name = 'triangulation_divergence_insights'
  ) THEN
    ALTER TABLE retrospectives
    ADD COLUMN triangulation_divergence_insights JSONB;
  END IF;

  -- Add verbatim citations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives'
    AND column_name = 'verbatim_citations'
  ) THEN
    ALTER TABLE retrospectives
    ADD COLUMN verbatim_citations JSONB;
  END IF;

  -- Add coverage analysis
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives'
    AND column_name = 'coverage_analysis'
  ) THEN
    ALTER TABLE retrospectives
    ADD COLUMN coverage_analysis JSONB;
  END IF;
END $$;

-- Index for audit retrospectives
CREATE INDEX IF NOT EXISTS idx_retrospectives_audit
  ON retrospectives(audit_id);

-- ============================================================================
-- 6. RLS Policies for new tables
-- ============================================================================

-- Runtime audits RLS
ALTER TABLE runtime_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read runtime audits"
  ON runtime_audits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role has full access to runtime audits"
  ON runtime_audits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Triangulation log RLS
ALTER TABLE audit_triangulation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read triangulation log"
  ON audit_triangulation_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role has full access to triangulation log"
  ON audit_triangulation_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Retrospective contributions RLS
ALTER TABLE retrospective_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read retro contributions"
  ON retrospective_contributions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role has full access to retro contributions"
  ON retrospective_contributions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7. Audit retrospective quality view
-- ============================================================================
-- Aggregates quality metrics for audit retrospectives
CREATE OR REPLACE VIEW audit_retrospective_quality AS
SELECT
  r.id as retro_id,
  r.audit_id,
  ra.audit_file_path,
  ra.audit_date,
  r.quality_score,
  r.status,
  r.created_at,

  -- Coverage analysis
  ra.total_findings,
  ra.coverage_pct,

  -- Triangulation metrics
  ra.triangulation_consensus_rate,
  ra.verbatim_preservation_rate,

  -- Contribution counts
  (SELECT COUNT(*) FROM retrospective_contributions rc WHERE rc.retro_id = r.id) as contribution_count,
  (SELECT COUNT(*) FROM retrospective_contributions rc WHERE rc.retro_id = r.id AND rc.contributor_type = 'chairman') as chairman_contributions,
  (SELECT COUNT(*) FROM retrospective_contributions rc WHERE rc.retro_id = r.id AND rc.contributor_type = 'triangulation_partner') as triangulation_contributions,
  (SELECT COUNT(*) FROM retrospective_contributions rc WHERE rc.retro_id = r.id AND rc.contributor_type = 'sub_agent') as subagent_contributions,

  -- Quality criteria checks
  (ra.coverage_pct = 100) as has_full_coverage,
  (jsonb_array_length(COALESCE(r.verbatim_citations, '[]'::jsonb)) >= 3) as has_verbatim_citations,
  (r.triangulation_divergence_insights IS NOT NULL) as has_divergence_insights,

  -- Computed quality score components
  CASE
    WHEN ra.coverage_pct = 100 THEN 25
    ELSE ROUND(ra.coverage_pct * 0.25)
  END as coverage_score,
  CASE
    WHEN jsonb_array_length(COALESCE(r.verbatim_citations, '[]'::jsonb)) >= 3 THEN 20
    ELSE jsonb_array_length(COALESCE(r.verbatim_citations, '[]'::jsonb)) * 7
  END as verbatim_score

FROM retrospectives r
LEFT JOIN runtime_audits ra ON r.audit_id = ra.id
WHERE r.retro_type = 'AUDIT';

-- ============================================================================
-- 8. Updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION update_runtime_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'runtime_audits'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE runtime_audits
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trigger_runtime_audit_updated_at ON runtime_audits;
CREATE TRIGGER trigger_runtime_audit_updated_at
  BEFORE UPDATE ON runtime_audits
  FOR EACH ROW
  EXECUTE FUNCTION update_runtime_audit_updated_at();

-- ============================================================================
-- 9. Comments for documentation
-- ============================================================================
COMMENT ON TABLE runtime_audits IS
  'First-class entities for runtime audit sessions. Tracks coverage metrics,
   triangulation quality, and timing for retrospective generation.
   Created from triangulated recommendations (Claude + OpenAI + Antigravity).';

COMMENT ON TABLE audit_triangulation_log IS
  'Preserves independent 3-model analysis for each audit issue.
   Immutable after capture - provides traceability for consensus decisions.
   Supports divergence analysis in retrospectives.';

COMMENT ON TABLE retrospective_contributions IS
  'Multi-voice contributions to retrospectives from various sources:
   - triangulation_partner: Claude, ChatGPT, Antigravity
   - sub_agent: DATABASE, SECURITY, TESTING, etc.
   - chairman: Direct Chairman feedback
   - system: Automated metrics and analysis';

COMMENT ON VIEW audit_retrospective_quality IS
  'Quality metrics view for audit retrospectives.
   Used to enforce quality gates and track improvement over time.
   Target: 100% coverage, ≥3 verbatim citations, divergence insights present.';
