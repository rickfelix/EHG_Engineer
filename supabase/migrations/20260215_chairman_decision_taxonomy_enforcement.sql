-- SD-EVA-R2-FIX-CHAIRMAN-DB-001: Chairman Decision Taxonomy DB Enforcement
-- Addresses R2 audit finding CRIT-002: Unconstrained decision column
--
-- Replaces old CHECK constraint (7 generic values) with comprehensive
-- constraint covering all 28 stage-specific decision types from EVA templates.
--
-- Stage decision types:
--   Stage 3:  pass, revise, kill
--   Stage 5:  pass, conditional_pass, kill
--   Stage 13: pass, kill
--   Stage 17: go, conditional_go, no_go
--   Stage 19: complete, continue, blocked
--   Stage 20: pass, conditional_pass, fail
--   Stage 21: approve, conditional, reject
--   Stage 22: release, hold, cancel
--   Stage 23: go, no-go, conditional_go
--   Stage 25: continue, pivot, expand, sunset, exit
--   Generic:  proceed, fix, pause, override, pending, terminate
--
-- To add new decision types in the future:
--   1. Add the value to the relevant stage template
--   2. Drop this constraint and re-create with the new value added
--   3. Update this migration file for reference

BEGIN;

-- Drop old constraint (only 7 values)
ALTER TABLE chairman_decisions
  DROP CONSTRAINT IF EXISTS chairman_decisions_decision_check;

-- Create new comprehensive constraint (28 values)
ALTER TABLE chairman_decisions
  ADD CONSTRAINT chairman_decisions_decision_check
  CHECK (decision IN (
    'pass', 'revise', 'kill',
    'conditional_pass', 'conditional_go',
    'go', 'no_go', 'no-go',
    'complete', 'continue', 'blocked',
    'fail', 'approve', 'conditional', 'reject',
    'release', 'hold', 'cancel',
    'pivot', 'expand', 'sunset', 'exit', 'terminate',
    'proceed', 'fix', 'pause', 'override', 'pending'
  ));

COMMIT;
