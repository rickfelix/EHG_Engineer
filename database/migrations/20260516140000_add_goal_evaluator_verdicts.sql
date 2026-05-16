-- Sibling B FR-B-4: goal_evaluator_verdicts (DEDICATED table per GOAL-VERDICTS-STORAGE-DECISION)
-- Trust-tier separation, CISO posture. Ordinal 20260516140000 > Sibling A 20260516130002 (in main).

CREATE TABLE IF NOT EXISTS goal_evaluator_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID,
  sd_key TEXT,
  prompt TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  verdict TEXT NOT NULL,
  votes JSONB NOT NULL DEFAULT '[]',
  confidence NUMERIC(5,4),
  vocab_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  validator_name TEXT NOT NULL DEFAULT 'goal_evaluator',
  correlation_id UUID DEFAULT gen_random_uuid(),
  audit_log_id UUID,
  smoke_test_passed_at TIMESTAMPTZ,
  runtime_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_evaluator_verdicts_verdict_check') THEN
    ALTER TABLE goal_evaluator_verdicts
      ADD CONSTRAINT goal_evaluator_verdicts_verdict_check
      CHECK (verdict IN ('PASS','UNANIMITY_FAIL','CONTRACT_MALFORMED','CONTRACT_MISSING'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_goal_evaluator_verdicts_sd_key ON goal_evaluator_verdicts (sd_key);
CREATE INDEX IF NOT EXISTS idx_goal_evaluator_verdicts_created ON goal_evaluator_verdicts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_evaluator_verdicts_correlation ON goal_evaluator_verdicts (correlation_id);
CREATE INDEX IF NOT EXISTS idx_goal_evaluator_verdicts_prompt_hash ON goal_evaluator_verdicts (prompt_hash);

ALTER TABLE goal_evaluator_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goal_evaluator_verdicts_insert_only ON goal_evaluator_verdicts;
CREATE POLICY goal_evaluator_verdicts_insert_only ON goal_evaluator_verdicts
  FOR INSERT TO PUBLIC WITH CHECK (true);

DROP POLICY IF EXISTS goal_evaluator_verdicts_read_all ON goal_evaluator_verdicts;
CREATE POLICY goal_evaluator_verdicts_read_all ON goal_evaluator_verdicts
  FOR SELECT TO PUBLIC USING (true);

COMMENT ON TABLE goal_evaluator_verdicts IS 'Sibling B (SD-WRITERCONSUMER-...-001-B) — DEDICATED table for /goal advisory verdicts (trust-tier separation, CISO posture; per parent GOAL-VERDICTS-STORAGE-DECISION). INSERT-only audit ledger.';
