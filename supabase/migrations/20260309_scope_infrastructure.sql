-- Scope Infrastructure Migration
-- SD: SD-MAN-INFRA-SEMANTIC-VALIDATION-GATES-002
--
-- Adds scope_keywords TEXT[] to strategic_directives_v2 (with GIN index)
-- and scope_snapshot JSONB to sd_phase_handoffs for persistent scope tracking.

-- Add scope_keywords column to strategic_directives_v2
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS scope_keywords TEXT[];

-- Create GIN index for efficient array containment queries
CREATE INDEX IF NOT EXISTS idx_sdv2_scope_keywords_gin
  ON strategic_directives_v2
  USING GIN (scope_keywords);

-- Add scope_snapshot column to sd_phase_handoffs
ALTER TABLE sd_phase_handoffs
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB;

-- Comment columns for documentation
COMMENT ON COLUMN strategic_directives_v2.scope_keywords
  IS 'Extracted keywords from scope/title/description for overlap detection. Updated at LEAD phase.';

COMMENT ON COLUMN sd_phase_handoffs.scope_snapshot
  IS 'Scope snapshot captured at handoff boundary. JSONB with keywords, keyword_count, scope_text, timestamp.';
