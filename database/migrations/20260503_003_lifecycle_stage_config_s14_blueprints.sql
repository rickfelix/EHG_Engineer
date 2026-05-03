-- ============================================================================
-- SD-LEO-FIX-S14-WORKER-OMITS-001 FR-006 — lifecycle_stage_config[14] ensures
-- all 5 required blueprint artifacts are declared.
--
-- Origin: 2026-05-03 PrivacyPatrol AI venture monitoring revealed S14 missing
-- 4 of 5 blueprint artifacts (data_model, erd_diagram, api_contract,
-- schema_spec). Root cause was in the persistence layer (FR-001), not the
-- config — but this migration ships as the DDL contract so a fresh deploy or
-- DB rebuild has the correct expected_artifacts list.
--
-- Per database-agent finding 04f646d8: required_artifacts ALREADY contains
-- all 5 target types in the live DB; this migration is a no-op against
-- current state. Keeping the migration for:
--   1. Fresh-deploy correctness
--   2. Migration-history audit trail
--   3. Rollback safety: if some future migration removes a type, this one
--      restores it
--
-- The column is `stage_number` (NOT `lifecycle_stage`) per database-agent
-- finding. Array cast must be ::text[] (NOT ::varchar[]) per dry-run.
--
-- Idempotency: WHERE clause uses IS DISTINCT FROM with ::text[] cast. Re-run
-- updates 0 rows when the array already matches.
-- ============================================================================

BEGIN;

UPDATE lifecycle_stage_config
   SET required_artifacts = ARRAY[
         'blueprint_technical_architecture',
         'blueprint_data_model',
         'blueprint_erd_diagram',
         'blueprint_api_contract',
         'blueprint_schema_spec'
       ]::text[]
 WHERE stage_number = 14
   AND required_artifacts IS DISTINCT FROM ARRAY[
         'blueprint_technical_architecture',
         'blueprint_data_model',
         'blueprint_erd_diagram',
         'blueprint_api_contract',
         'blueprint_schema_spec'
       ]::text[];

-- Down-migration recipe (emergency rollback):
-- This migration is idempotent + a no-op against current state. Rolling back
-- would require knowing the prior value of required_artifacts. If rollback is
-- truly needed, query the migration_history (or git log of this file) to
-- reconstruct the prior state. Default rollback is a no-op.

COMMIT;
