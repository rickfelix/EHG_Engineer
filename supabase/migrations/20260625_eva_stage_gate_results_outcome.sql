-- SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 (FR-5): verdict + eventual-outcome data foundation.
-- ADDITIVE + NULLABLE + REVERSIBLE / idempotent. eva_stage_gate_results already records the
-- gate VERDICT (passed, gate_criteria, overall_score, evaluated_by); this adds the EVENTUAL
-- resolved OUTCOME so kill thresholds can later be EMPIRICALLY calibrated against real results
-- (false-kill / false-pass rates). No destructive change; existing rows are unaffected.
--
-- CALIBRATION GUARD: do NOT empirically tighten any kill threshold before >= ~50
-- outcome-resolved ventures. Below that, tightening overfits LLM-variance noise (S3 is the
-- noisiest, ungrounded stage). The current thresholds are principled PRE-CALIBRATION defaults.

ALTER TABLE eva_stage_gate_results
  ADD COLUMN IF NOT EXISTS resolved_outcome text,       -- e.g. 'survived' | 'killed' | 'pivoted' | 'exited' | 'false_kill' | 'false_pass'
  ADD COLUMN IF NOT EXISTS outcome_resolved_at timestamptz;

COMMENT ON COLUMN eva_stage_gate_results.resolved_outcome IS
  'SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 FR-5: eventual resolved outcome of this gate verdict (data foundation for empirical kill-threshold calibration; do not tighten before >=~50 resolved outcomes).';
COMMENT ON COLUMN eva_stage_gate_results.outcome_resolved_at IS
  'SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 FR-5: timestamp when resolved_outcome was set.';

-- Rollback (reversible):
--   ALTER TABLE eva_stage_gate_results
--     DROP COLUMN IF EXISTS resolved_outcome,
--     DROP COLUMN IF EXISTS outcome_resolved_at;
