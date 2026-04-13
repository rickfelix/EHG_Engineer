-- Vision Scoring Audit Log
-- SD: SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-A
-- Purpose: Audit trail for every vision gate evaluation with dynamic threshold context

CREATE TABLE IF NOT EXISTS vision_scoring_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,
  sd_type TEXT NOT NULL,
  total_dims INTEGER NOT NULL DEFAULT 0,
  addressable_count INTEGER NOT NULL DEFAULT 0,
  base_threshold INTEGER NOT NULL,
  adjusted_threshold INTEGER NOT NULL,
  score INTEGER,
  verdict TEXT NOT NULL,
  floor_rule_triggered BOOLEAN NOT NULL DEFAULT false,
  evaluation_context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by SD
CREATE INDEX IF NOT EXISTS idx_vision_audit_sd_id ON vision_scoring_audit_log(sd_id);

-- Index for querying by verdict (for Phase 2 analysis)
CREATE INDEX IF NOT EXISTS idx_vision_audit_verdict ON vision_scoring_audit_log(verdict);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_vision_audit_created_at ON vision_scoring_audit_log(created_at);

COMMENT ON TABLE vision_scoring_audit_log IS 'Audit trail for vision scoring gate evaluations with dynamic threshold context. SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-A';
