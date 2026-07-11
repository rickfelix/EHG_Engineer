-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B (FR-3): additive escalation-machinery column.
-- NOT registry substrate (child A's owner/backfill work already shipped in PR #5929) -- this is
-- the ladder-escalation counter, scoped and justified separately per LEAD validation-agent +
-- risk-agent review: a SEPARATE nullable column, never packed into last_state (which stays a pure
-- enum -- overloading it would break the exact-string transition-dedup at
-- periodic-liveness-watcher.mjs, the fleet-dashboard.cjs raw-print consumer, and the realdb
-- regression test's STATE.OK assertion).
--
-- The RPC function below performs the increment atomically in a single UPDATE...RETURNING
-- statement (SQL, not JS read-modify-write) so overlapping watcher runs cannot lose an update or
-- double-count (risk-agent MEDIUM finding). The WHERE last_state = 'OVERDUE' guard means a row
-- that has already recovered can never be incremented by a stale/racing call.
--
-- REQUIRES CHAIRMAN/ADAM-DELEGATED APPLY: this is a gated DDL change (scripts/apply-migration.js
-- --prod-deploy, three-factor guard). The autonomous session that authored this migration cannot
-- self-issue the required MIGRATION_APPLY_TOKEN -- flagged on the SD as requiring manual apply
-- before the ladder-escalation logic activates. The watcher's owner-first routing (FR-1/FR-2) does
-- NOT depend on this column and works correctly before this migration lands; ladder-escalation
-- fails soft (logs a warning, skips the ladder) until it is applied.

ALTER TABLE periodic_process_registry
  ADD COLUMN IF NOT EXISTS consecutive_miss_count integer;

COMMENT ON COLUMN periodic_process_registry.consecutive_miss_count IS
  'Consecutive-OVERDUE-tick counter for ladder escalation (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-3). NULL/0 = no active escalation episode. Reset to 0 on recovery to OK. Incremented only via periodic_registry_increment_consecutive_miss() for atomicity.';

CREATE OR REPLACE FUNCTION periodic_registry_increment_consecutive_miss(p_process_key text)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE periodic_process_registry
  SET consecutive_miss_count = COALESCE(consecutive_miss_count, 0) + 1
  WHERE process_key = p_process_key AND last_state = 'OVERDUE'
  RETURNING consecutive_miss_count;
$$;
