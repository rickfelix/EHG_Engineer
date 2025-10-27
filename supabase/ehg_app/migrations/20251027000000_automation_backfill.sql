-- Backfill migration for manually created automation tables
-- These tables exist in production but lacked checked-in migrations
-- Part of governance hygiene pass (2025-10-27)

-- Table: automation_feedback
-- Purpose: Chairman feedback for learning automation confidence
CREATE TABLE IF NOT EXISTS automation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL,
  recommended_action TEXT NOT NULL,
  actual_action TEXT NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('agree', 'disagree', 'modify')),
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: automation_rules
-- Purpose: Per-stage automation rules with dynamic confidence scoring
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  stage_id INTEGER NOT NULL UNIQUE,
  condition TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('progress', 'approve', 'reject', 'skip', 'retry')),
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  automation_state TEXT NOT NULL CHECK (automation_state IN ('manual', 'assisted', 'auto')),
  learning_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: automation_history
-- Purpose: Audit trail of automated stage transitions
CREATE TABLE IF NOT EXISTS automation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  automation_state TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_automation_feedback_venture ON automation_feedback(venture_id);
CREATE INDEX IF NOT EXISTS idx_automation_feedback_stage ON automation_feedback(stage_id);
CREATE INDEX IF NOT EXISTS idx_automation_feedback_created ON automation_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_history_venture ON automation_history(venture_id);
CREATE INDEX IF NOT EXISTS idx_automation_history_stage ON automation_history(stage_id);
CREATE INDEX IF NOT EXISTS idx_automation_history_created ON automation_history(created_at DESC);

-- Table comments for documentation
COMMENT ON TABLE automation_feedback IS 'Chairman feedback for HITL learning loop - drives confidence adjustments in automation_rules';
COMMENT ON TABLE automation_rules IS 'Per-stage automation rules (40 total) with dynamic confidence scoring. Confidence thresholds: <60=manual, 60-85=assisted, ≥85=auto';
COMMENT ON TABLE automation_history IS 'Audit trail of all automated stage transitions and outcomes for compliance and analysis';

COMMENT ON COLUMN automation_rules.learning_data IS 'JSONB tracking: totalExecutions, successfulExecutions, successRate, lastUpdated';
COMMENT ON COLUMN automation_feedback.feedback IS 'Chairman response: agree (+2% confidence), disagree (-5% confidence), modify (neutral)';
