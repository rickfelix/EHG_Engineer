-- Add unique constraint for recordGateResult() UPSERT
-- Without this, ON CONFLICT (venture_id, stage_number, gate_type) fails
CREATE UNIQUE INDEX IF NOT EXISTS idx_eva_stage_gate_results_unique
ON eva_stage_gate_results (venture_id, stage_number, gate_type);
