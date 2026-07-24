-- =============================================================================
-- DOWN Migration (DEFAULT / PREFERRED): data-level partial revert for
--                 advance_venture_stage's SSOT-based gate check.
-- SD: SD-LEO-INFRA-RECONCILE-EHG-REPO-001 (incident mitigation)
-- Date: 2026-07-22
--
-- PURPOSE: If the SSOT-based gate check causes an incident (e.g. a chairman-
-- approval backlog blocks a fleet of ventures newly gated at S10/S16/S19/S25),
-- this is the DEFAULT, PREFERRED rollback lever: relax ONLY the newly-enforced
-- promotion gates by setting their gate_type to 'none' in the SSOT. This is a
-- pure data change — the fixed RPC code (SSOT read + 23/24 label fix) stays
-- intact, so the confirmed-active bypass and the 23/24 label swap are NOT
-- reopened.
--
-- Per security-agent finding (sub_agent_execution_results
-- 24319524-85a9-4614-b019-7246d4f9bede): reverting to the pre-fix RPC CODE is
-- NEVER an acceptable steady state, because it restores a confirmed-exploited
-- authorization bypass (6 of 45 historical advances from these stages already
-- had no approved chairman decision). If the incident is "too many ventures
-- newly blocked", the fix is to relax the DATA (this file), not the CODE.
--
-- This SSOT-level relaxation also affects fn_advance_venture_stage and all
-- frontend derived views/hooks (they all read the same venture_stages table)
-- -- which is the point: one SSOT, one lever.
--
-- A separate, genuinely-last-resort full-function code revert (only for the
-- scenario where the NEW CODE ITSELF is broken, not merely "too many ventures
-- blocked") is provided in:
--   20260722_EMERGENCY_ONLY_full_code_revert_advance_venture_stage.sql
-- Do not reach for that file for an approval-backlog incident -- use this one.
--
-- Idempotent: UPDATE ... WHERE, safe to re-run.
-- =============================================================================

-- Re-open ONLY the newly-enforced promotion gates (10, 16, 19, 25). Run this
-- during an incident to immediately stop new blocking at these 4 stages.
UPDATE venture_stages
  SET gate_type = 'none'
  WHERE stage_number IN (10, 16, 19, 25);

-- ---------------------------------------------------------------------------
-- Self-verification: confirm the relaxation landed and nothing else moved.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_relaxed_count INTEGER;
  v_other_gates_intact INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_relaxed_count
    FROM venture_stages
    WHERE stage_number IN (10, 16, 19, 25) AND gate_type = 'none';
  ASSERT v_relaxed_count = 4, 'partial-revert: expected all 4 stages (10,16,19,25) relaxed to gate_type=none';

  SELECT COUNT(*) INTO v_other_gates_intact
    FROM venture_stages
    WHERE stage_number IN (3, 5, 13, 23) AND gate_type = 'kill';
  ASSERT v_other_gates_intact = 4, 'partial-revert: kill gates (3,5,13,23) must remain intact';
END
$verify$;

-- ---------------------------------------------------------------------------
-- RESTORE (when the approval backlog clears / the incident is resolved):
-- Re-apply the canonical promotion classification to close the gates again.
-- Uncomment and run when ready to restore full enforcement:
--
--   UPDATE venture_stages SET gate_type = 'promotion'
--   WHERE stage_number IN (10, 16, 19, 25);
-- ---------------------------------------------------------------------------
