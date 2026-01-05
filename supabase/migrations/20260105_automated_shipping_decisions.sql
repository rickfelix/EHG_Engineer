-- Automated Shipping Decisions Table
-- Purpose: Store LLM-powered shipping decisions for LEO Protocol automation
-- Created: 2026-01-05
-- Uses: GPT-5.2 for intelligent shipping decisions (PR creation, merge, cleanup)

-- ============================================================================
-- MAIN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipping_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SD Context
  sd_id TEXT NOT NULL,
  handoff_type TEXT NOT NULL CHECK (handoff_type IN ('EXEC-TO-PLAN', 'LEAD-FINAL-APPROVAL')),

  -- Decision Type
  decision_type TEXT NOT NULL CHECK (decision_type IN ('PR_CREATION', 'PR_MERGE', 'BRANCH_CLEANUP')),

  -- LLM Decision
  decision TEXT NOT NULL CHECK (decision IN ('PROCEED', 'ESCALATE', 'DEFER')),
  confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reasoning TEXT NOT NULL,

  -- Context Provided to LLM
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Execution Details
  executed_at TIMESTAMPTZ,
  execution_result JSONB,  -- { success: bool, pr_url: string, error: string }
  execution_duration_ms INTEGER,

  -- Human Override (only if escalated)
  escalated_to_human BOOLEAN DEFAULT false,
  human_decision TEXT,
  human_decision_at TIMESTAMPTZ,
  human_notes TEXT,

  -- AI Metrics
  model TEXT DEFAULT 'gpt-5.2',
  tokens_used JSONB,
  cost_usd NUMERIC(10,6),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_shipping_decisions_sd ON shipping_decisions(sd_id);
CREATE INDEX idx_shipping_decisions_type ON shipping_decisions(decision_type);
CREATE INDEX idx_shipping_decisions_confidence ON shipping_decisions(confidence);
CREATE INDEX idx_shipping_decisions_escalated ON shipping_decisions(escalated_to_human) WHERE escalated_to_human = true;
CREATE INDEX idx_shipping_decisions_time ON shipping_decisions(created_at DESC);
CREATE INDEX idx_shipping_decisions_handoff ON shipping_decisions(handoff_type, decision_type);

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- View 1: Shipping Decision Summary
CREATE OR REPLACE VIEW v_shipping_decision_summary AS
SELECT
  decision_type,
  confidence,
  COUNT(*) as total_decisions,
  COUNT(*) FILTER (WHERE decision = 'PROCEED') as proceed_count,
  COUNT(*) FILTER (WHERE decision = 'ESCALATE') as escalate_count,
  COUNT(*) FILTER (WHERE decision = 'DEFER') as defer_count,
  ROUND(AVG(confidence_score), 1) as avg_confidence_score,
  ROUND(AVG(execution_duration_ms), 0) as avg_execution_ms,
  ROUND(SUM(cost_usd)::numeric, 4) as total_cost_usd
FROM shipping_decisions
GROUP BY decision_type, confidence
ORDER BY decision_type, confidence;

-- View 2: Recent Shipping Decisions (for debugging)
CREATE OR REPLACE VIEW v_recent_shipping_decisions AS
SELECT
  id,
  sd_id,
  handoff_type,
  decision_type,
  decision,
  confidence,
  confidence_score,
  reasoning,
  executed_at,
  execution_result,
  escalated_to_human,
  created_at
FROM shipping_decisions
ORDER BY created_at DESC
LIMIT 50;

-- View 3: Escalation Analysis
CREATE OR REPLACE VIEW v_shipping_escalation_analysis AS
SELECT
  decision_type,
  COUNT(*) FILTER (WHERE escalated_to_human = true) as escalated_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE escalated_to_human = true) / NULLIF(COUNT(*), 0), 1) as escalation_rate_pct,
  ARRAY_AGG(DISTINCT sd_id) FILTER (WHERE escalated_to_human = true) as escalated_sd_ids
FROM shipping_decisions
GROUP BY decision_type
ORDER BY escalation_rate_pct DESC;

-- View 4: Execution Success Rate
CREATE OR REPLACE VIEW v_shipping_execution_success AS
SELECT
  decision_type,
  COUNT(*) FILTER (WHERE (execution_result->>'success')::boolean = true) as success_count,
  COUNT(*) FILTER (WHERE (execution_result->>'success')::boolean = false) as failure_count,
  COUNT(*) FILTER (WHERE execution_result IS NULL) as not_executed_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (execution_result->>'success')::boolean = true) /
        NULLIF(COUNT(*) FILTER (WHERE execution_result IS NOT NULL), 0), 1) as success_rate_pct
FROM shipping_decisions
GROUP BY decision_type
ORDER BY decision_type;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE shipping_decisions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all decisions
CREATE POLICY "Allow read for authenticated" ON shipping_decisions
  FOR SELECT TO authenticated
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow all for service role" ON shipping_decisions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRIGGER FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_shipping_decisions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipping_decisions_updated_at
  BEFORE UPDATE ON shipping_decisions
  FOR EACH ROW
  EXECUTE FUNCTION update_shipping_decisions_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE shipping_decisions IS 'LLM-powered shipping decisions for LEO Protocol automation. Tracks PR creation, merge, and branch cleanup decisions.';

COMMENT ON COLUMN shipping_decisions.sd_id IS 'Strategic Directive ID this decision relates to';
COMMENT ON COLUMN shipping_decisions.handoff_type IS 'LEO handoff phase: EXEC-TO-PLAN (PR creation) or LEAD-FINAL-APPROVAL (merge/cleanup)';
COMMENT ON COLUMN shipping_decisions.decision_type IS 'Type of shipping decision: PR_CREATION, PR_MERGE, or BRANCH_CLEANUP';
COMMENT ON COLUMN shipping_decisions.decision IS 'LLM decision: PROCEED (automated), ESCALATE (human needed), DEFER (fix issues)';
COMMENT ON COLUMN shipping_decisions.confidence IS 'LLM confidence level: HIGH, MEDIUM, LOW. LOW always escalates.';
COMMENT ON COLUMN shipping_decisions.context_snapshot IS 'Full context provided to LLM for decision (SD, git, CI, PR, tests, risk)';
COMMENT ON COLUMN shipping_decisions.execution_result IS 'Result of executing the decision: { success, pr_url, error }';
COMMENT ON COLUMN shipping_decisions.escalated_to_human IS 'True if decision was escalated due to LOW confidence';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'shipping_decisions') THEN
    RAISE EXCEPTION 'Migration failed: shipping_decisions table not created';
  END IF;

  -- Verify views exist
  IF NOT EXISTS (SELECT FROM pg_views WHERE viewname = 'v_shipping_decision_summary') THEN
    RAISE EXCEPTION 'Migration failed: v_shipping_decision_summary view not created';
  END IF;

  RAISE NOTICE '✅ Migration successful: shipping_decisions table created';
  RAISE NOTICE '   Table: shipping_decisions';
  RAISE NOTICE '   Views: v_shipping_decision_summary, v_recent_shipping_decisions, v_shipping_escalation_analysis, v_shipping_execution_success';
  RAISE NOTICE '   Indexes: 6 indexes created for performance';
  RAISE NOTICE '   RLS: 2 policies enabled (authenticated read, service role full)';
  RAISE NOTICE '   Trigger: updated_at auto-update';
END $$;
