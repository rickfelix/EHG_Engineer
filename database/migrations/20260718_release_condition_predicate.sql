-- Migration: release_condition_predicate — additive machine-evaluable predicate column
-- SD: SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A (FR-3)
-- Purpose: hold_state_contract_violations.release_condition is free-TEXT, observe-mode-only,
--          stored raw/unparsed (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001). Per Solomon's folded
--          adjudication (ab03cf18), the switch-on class registry homes IN the hold-state-
--          contract surface -- a switch-on class row IS a hold row with a machine-verifiable
--          release_condition. This adds a NEW, additive predicate column alongside the
--          existing free-text one (non-breaking) so child B/C can programmatically evaluate
--          a release condition instead of just logging its raw text.
-- All-additive (nullable column, IF NOT EXISTS) -- TIER-1 auto-apply eligible, same class as
-- the parent 20260716_hold_state_contract.sql migration. NOT chairman-gated (schema-shape
-- only; carries no auto-proceed authority itself -- unlike chairman_switchon_policy above).
-- Date: 2026-07-18

BEGIN;

ALTER TABLE public.hold_state_contract_violations
  ADD COLUMN IF NOT EXISTS release_condition_predicate JSONB;

COMMENT ON COLUMN public.hold_state_contract_violations.release_condition_predicate IS
  'Machine-evaluable predicate form of release_condition (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A FR-3), additive alongside the existing free-text release_condition column (which remains the raw-text log, unchanged). Shape: {type: "test_green"|"manual_flag"|"db_row_exists", params: {...}}. Evaluated via lib/governance/release-condition-predicate.js evaluate(predicate, state) -- state is caller-injected, never read live by the evaluator itself, so it stays pure/testable in isolation. NULL for existing rows and for any release_condition that has not yet been expressed as a predicate.';

COMMIT;

-- Rollback:
-- ALTER TABLE public.hold_state_contract_violations DROP COLUMN IF EXISTS release_condition_predicate;
