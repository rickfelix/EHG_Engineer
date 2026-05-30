-- =============================================================================
-- Migration: Drop legacy stage-definition tables (Child F, part 2/2 — IRREVERSIBLE)
-- SD: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-F
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-30
--
-- Purpose:
--   Final teardown of the legacy stage-definition tables now that venture_stages
--   is the sole source of truth and EVERY reader has been repointed:
--     - DB: 5 runtime functions + v_chairman_pending_decisions (part 1/2, applied)
--     - EHG_Engineer code: golden-nugget lib, 3 scripts, 2 tests, generator parity removed
--     - EHG app (rickfelix/ehg): useChairmanConfig + useDecisionDetail hooks
--   fn_advance_venture_stage was already repointed by Child C.
--
-- Pre-conditions verified before authoring (df06faf7):
--   - literal-substring scan: 0 of the 5 runtime fns / the view read the legacy tables
--   - no DB function WRITES to the legacy tables; fn_sync_venture_stages_upsert has no
--     caller other than the two sync triggers (dropped with the tables)
--   - no FK and no view/matview depends on the 3 tables
--   - full backup committed: database/backups/20260530_childF_legacy_stage_tables_backup.sql
--     (validated: restores 26/26/21 rows into a temp schema)
--
-- ⚠️ SEQUENCING: apply this ONLY AFTER the EHG_Engineer PR + the ehg hook PR are
--   merged AND the EHG app is redeployed, so no deployed build references a dropped
--   table. (The hooks degrade gracefully — default hard_gate_stages / empty stage
--   panel — but should not be left in that state.)
--
-- REVERSIBLE-IN-PRACTICE (not via a down-migration): re-run the committed backup
--   .sql to recreate the 3 tables + data, then CREATE OR REPLACE the readers back
--   (companion 20260530_childF_repoint_readers_to_venture_stages_rollback.sql) while
--   the tables exist again. The sync/audit triggers are NOT restored (obsolete).
-- =============================================================================

BEGIN;

-- Belt-and-suspenders: re-assert no FK / view depends on the tables AT APPLY TIME.
DO $guard$
DECLARE v_dep text;
BEGIN
  SELECT string_agg(DISTINCT dependent, ', ') INTO v_dep FROM (
    SELECT cl.relname AS dependent
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class cl ON cl.oid = rw.ev_class
    JOIN pg_class tgt ON tgt.oid = d.refobjid
    WHERE tgt.relname IN ('stage_config','lifecycle_stage_config','stage_config_audit')
      AND cl.relname NOT IN ('stage_config','lifecycle_stage_config','stage_config_audit')
    UNION
    SELECT conrelid::regclass::text
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid::regclass::text IN (
        'stage_config','lifecycle_stage_config','stage_config_audit',
        'public.stage_config','public.lifecycle_stage_config','public.stage_config_audit')
  ) x;
  IF v_dep IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT DROP: external dependents still reference the legacy tables: %', v_dep;
  END IF;
END
$guard$;

-- Drop the tables. Their OWN triggers (sync + audit) drop automatically with them.
DROP TABLE IF EXISTS public.stage_config_audit;
DROP TABLE IF EXISTS public.stage_config;
DROP TABLE IF EXISTS public.lifecycle_stage_config;

-- Drop the now-orphaned sync/audit trigger functions (no remaining callers).
DROP FUNCTION IF EXISTS public.tg_stage_config_sync_venture_stages();
DROP FUNCTION IF EXISTS public.tg_lifecycle_sync_venture_stages();
DROP FUNCTION IF EXISTS public.fn_sync_venture_stages_upsert(integer);
DROP FUNCTION IF EXISTS public.fn_stage_config_audit_trigger();
DROP FUNCTION IF EXISTS public.fn_stage_config_audit_immutable();
DROP FUNCTION IF EXISTS public.update_lifecycle_stage_config_timestamp();

-- Terminal verification: abort COMMIT unless the teardown is complete + SSOT intact.
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('stage_config','lifecycle_stage_config','stage_config_audit')
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: a legacy table still exists after drop';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('tg_stage_config_sync_venture_stages','tg_lifecycle_sync_venture_stages',
                        'fn_sync_venture_stages_upsert','fn_stage_config_audit_trigger',
                        'fn_stage_config_audit_immutable','update_lifecycle_stage_config_timestamp')
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: an orphaned sync/audit function still exists';
  END IF;

  IF (SELECT count(*) FROM venture_stages) <> 26 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_stages is not intact (expected 26 rows)';
  END IF;

  RAISE NOTICE 'VERIFY OK: 3 legacy tables + 6 orphan functions dropped; venture_stages intact (26 rows).';
END
$verify$;

COMMIT;
