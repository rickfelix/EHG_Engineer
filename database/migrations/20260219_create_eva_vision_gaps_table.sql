-- ============================================================================
-- Migration: Create eva_vision_gaps table
-- SD: SD-MAN-INFRA-VISION-TABLE-API-ACCESS-001
-- Date: 2026-02-19
--
-- Context: Investigation revealed the 10 "broken" vision tables referenced in
-- the SD description do not exist in the database and have no code references
-- (confirmed via pg_class and full codebase search). Only eva_vision_scores
-- exists and is fully operational.
--
-- This migration creates eva_vision_gaps as the single highest-value table:
-- - Currently gaps are embedded in dimension_scores JSONB within eva_vision_scores
-- - A relational table enables direct gap queries, status tracking, and linking
--   to corrective SDs without parsing JSONB
-- - The corrective-sd-generator.mjs and Chairman Dashboard would benefit from
--   this relational structure
--
-- Assessment of other 9 referenced tables:
--   eva_vision_dimensions    → Dimensions stored in eva_vision_documents.extracted_dimensions JSONB
--   eva_vision_config        → No code references found; not needed
--   eva_vision_history       → No code references found; not needed
--   eva_vision_log           → No code references found; logs written to brainstorm_sessions
--   vision_governance_log    → No code references found; not needed
--   vision_scores            → Alias concept; eva_vision_scores covers this
--   vision_gaps              → This migration covers the gap concept
--   eva_vision_scoring_history → No code references; eva_vision_scores is append-only (already a history)
--   eva_vision_corrective_actions → Tracked via strategic_directives_v2.vision_origin_score_id FK
--
-- ROLLBACK: DROP TABLE IF EXISTS eva_vision_gaps;
-- ============================================================================

-- ============================================================================
-- eva_vision_gaps
-- Relational representation of vision dimension gaps extracted from
-- eva_vision_scores.dimension_scores JSONB. Enables direct gap queries,
-- per-gap status tracking, and corrective SD linkage without JSONB parsing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_vision_gaps (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source score that identified this gap
  vision_score_id     UUID          REFERENCES eva_vision_scores(id) ON DELETE CASCADE,

  -- SD that was scored and found to have this gap (soft reference, TEXT not FK)
  sd_id               TEXT          NOT NULL,

  -- Dimension identification
  dimension_key       TEXT          NOT NULL,   -- e.g. 'V01', 'A03'
  dimension_name      TEXT,                     -- e.g. 'automation_by_default'

  -- Gap details extracted from dimension_scores JSONB
  dimension_score     NUMERIC(5,2)  NOT NULL,   -- Score for this dimension (0-100)
  gap_description     TEXT,                     -- LLM-generated gap explanation

  -- Severity derived from score
  severity            TEXT          NOT NULL DEFAULT 'medium'
                      CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- Lifecycle tracking
  status              TEXT          NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix', 'accepted')),

  -- Links corrective SD generated for this gap (soft reference)
  corrective_sd_id    TEXT,

  -- Acceptance tracking (for gaps accepted as deviations)
  accepted_at         TIMESTAMPTZ,
  accepted_by         TEXT,
  acceptance_rationale TEXT,

  -- Resolution tracking
  resolved_at         TIMESTAMPTZ,
  resolved_by         TEXT,

  -- Audit
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eva_vision_gaps IS
  'Relational representation of vision dimension gaps identified during EVA scoring. '
  'Gaps are extracted from eva_vision_scores.dimension_scores JSONB to enable direct '
  'queries, status tracking, and corrective SD linkage. Part of the Vision Governance '
  'closed-loop: Score → Gap → Corrective SD → Rescore.';

COMMENT ON COLUMN eva_vision_gaps.dimension_score IS
  'Score for this specific dimension (0-100). Gap threshold typically <70.';

COMMENT ON COLUMN eva_vision_gaps.corrective_sd_id IS
  'Intentional soft reference (no FK) to strategic_directives_v2.sd_key. '
  'Corrective SDs may be deleted or cancelled independently.';

-- ============================================================================
-- Indexes for common query patterns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_eva_vision_gaps_sd_id
  ON eva_vision_gaps (sd_id);

CREATE INDEX IF NOT EXISTS idx_eva_vision_gaps_status
  ON eva_vision_gaps (status)
  WHERE status NOT IN ('resolved', 'closed');

CREATE INDEX IF NOT EXISTS idx_eva_vision_gaps_dimension_key
  ON eva_vision_gaps (dimension_key);

CREATE INDEX IF NOT EXISTS idx_eva_vision_gaps_vision_score_id
  ON eva_vision_gaps (vision_score_id);

CREATE INDEX IF NOT EXISTS idx_eva_vision_gaps_severity_status
  ON eva_vision_gaps (severity, status)
  WHERE status = 'open';

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_eva_vision_gaps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER eva_vision_gaps_updated_at
  BEFORE UPDATE ON eva_vision_gaps
  FOR EACH ROW EXECUTE FUNCTION update_eva_vision_gaps_updated_at();

-- ============================================================================
-- Grants: match eva_vision_scores pattern
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON eva_vision_gaps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON eva_vision_gaps TO anon;
GRANT ALL ON eva_vision_gaps TO service_role;

-- ============================================================================
-- Row Level Security: match eva_vision_scores pattern
-- ============================================================================

ALTER TABLE eva_vision_gaps ENABLE ROW LEVEL SECURITY;

-- Service role gets full access (all operations)
CREATE POLICY "eva_vision_gaps_service_role_all"
  ON eva_vision_gaps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users get SELECT only
CREATE POLICY "eva_vision_gaps_authenticated_select"
  ON eva_vision_gaps
  FOR SELECT
  TO authenticated
  USING (true);
