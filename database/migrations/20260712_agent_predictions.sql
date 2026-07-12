-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: agent_predictions (real calibration table)
-- lib/agents/venture-ceo/truth-layer.js's logPrediction/logOutcome/computeCalibration were
-- in-memory no-ops referencing a "Phantom table 'agent_predictions' removed" comment. This is
-- a fresh, intentional, documented reintroduction (NOT the phantom SD-LEO-INFRA-PHANTOM-TABLE-
-- REFERENCE-001-B removed) — this SD wires the writer for real, for one seeded calibration row.
-- Schema shape follows the existing stage_of_death_predictions table as precedent
-- (predicted_probability/confidence_score/actual_outcome/prediction_accuracy pattern), adapted
-- to the fields truth-layer.js's logPrediction()/logOutcome() already build in-memory.
-- Additive only: CREATE TABLE IF NOT EXISTS, no ALTER on any existing table. Rollback = DROP.

CREATE TABLE IF NOT EXISTS agent_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  prediction_type TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  timeframe TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  was_correct BOOLEAN,
  actual_value NUMERIC,
  evidence TEXT,
  outcome_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_predictions_agent_id ON agent_predictions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_predictions_status ON agent_predictions(status);
