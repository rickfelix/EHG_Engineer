-- SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-D: Scope Boundary & Baseline Snapshot
-- Add scope_exclusions (what was intentionally excluded) and baseline_snapshot
-- (SD state at evaluation time) for scope drift detection across re-evaluations.

ALTER TABLE lead_evaluations
  ADD COLUMN IF NOT EXISTS scope_exclusions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS baseline_snapshot jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN lead_evaluations.scope_exclusions IS 'Array of {item, reason, deferred_to} objects tracking what was intentionally excluded from scope';
COMMENT ON COLUMN lead_evaluations.baseline_snapshot IS 'Snapshot of SD state (title, description, key_changes, success_criteria) at evaluation time for drift detection';
