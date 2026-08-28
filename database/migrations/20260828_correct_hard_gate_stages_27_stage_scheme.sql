-- SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 (FR-2) -- correct the stale
-- chairman_dashboard_config.hard_gate_stages value left over from the pre-27-stage scheme.
--
-- Pure DML (a data UPDATE on a config row), not DDL -- no CREATE/ALTER/DROP, no function or
-- trigger change, so this is a plain applied migration, not a chairman-gated one.
--
-- BEFORE (stale, pre-2026-08-28 renumbering): [3,5,10,13,17,18,19,23,24,25]
--   - stage 23 is now dedicated_venture_uat (gate_type='none', automated_check) -- a spurious
--     chairman gate currently fires on a fully-automated stage.
--   - stage 16 (promotion) and stage 26 (promotion) are missing entirely -- unenforced.
--
-- AFTER: the exact set derived from `SELECT stage_number FROM venture_stages WHERE gate_type
-- IN ('kill','promotion')`, measured live 2026-08-28: [3,5,10,13,16,17,18,19,24,25,26].
--
-- This column is documented as @deprecated (its own COMMENT ON COLUMN, added by
-- SD-LEO-REFAC-GATE-AUTO-ADVANCE-001) with a preserved-for-backward-compatibility note citing
-- "8+ active read sites in EHG UI + 4 worker sites" -- correcting the VALUE, not removing the
-- column, keeps every one of those readers seeing a value that matches the live 27-stage
-- venture_stages table instead of a stale pre-renumbering set.
--
-- NOTE (signaled to coordinator, severity=critical, 2026-08-28): the can_auto_advance(int)
-- SECURITY DEFINER RPC (database/migrations/20260512_can_auto_advance_rpc.sql) reads this same
-- config row but ALSO queries a `stage_config` table that no longer exists (superseded by
-- venture_stages) -- that RPC currently errors on every call and fail-closed BLOCKS all
-- auto-advance decisions fleet-wide. Fixing that RPC requires a chairman-gated SECURITY
-- DEFINER migration (TIER-2, 3-factor gate) and is explicitly OUT OF SCOPE for this migration
-- and this SD's locked scope -- tracked separately via the signal, not silently absorbed here.

BEGIN;

UPDATE chairman_dashboard_config
SET hard_gate_stages = '[3,5,10,13,16,17,18,19,24,25,26]'::jsonb
WHERE config_key = 'default';

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM chairman_dashboard_config
  WHERE config_key = 'default'
    AND hard_gate_stages = '[3,5,10,13,16,17,18,19,24,25,26]'::jsonb;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: expected exactly 1 chairman_dashboard_config row with config_key=default and the corrected hard_gate_stages, found %', v_count;
  END IF;
END $$;

COMMIT;
