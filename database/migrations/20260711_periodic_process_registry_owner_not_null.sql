-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A (FR-4): phase 2 of the two-phase owner migration.
-- Phase 1 is scripts/backfill-registry-owners.mjs (interim 'coordinator-fleet' on every NULL row).
-- This migration MUST run after it: the DO block below fails loud if any NULL owners remain,
-- so the constraint can never land on an un-backfilled table (validation-agent advisory).
--
-- Rollback: database/migrations/20260711_periodic_process_registry_owner_not_null_rollback.sql

DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT count(*) INTO null_count FROM periodic_process_registry WHERE owner IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'periodic_process_registry has % NULL-owner row(s) — run scripts/backfill-registry-owners.mjs before applying NOT NULL', null_count;
  END IF;
END $$;

ALTER TABLE periodic_process_registry
  ALTER COLUMN owner SET NOT NULL;

COMMENT ON COLUMN periodic_process_registry.owner IS
  'REQUIRED owner-agent for this process (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A). Interim value coordinator-fleet flows through the reassignment worklist (scripts/backfill-registry-owners.mjs). Sibling -B routes OVERDUE escalations owner-first.';
