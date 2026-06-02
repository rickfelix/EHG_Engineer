-- @approved-by: rickfelix@example.com
-- ============================================================================
-- LEO Protocol - Drop 4 stale backup_leo_* tables (backup-of-backup artifacts)
-- Migration: 20260602_drop_stale_backup_leo_tables.sql
-- ============================================================================
-- Purpose: Permanently drop four leftover CREATE TABLE AS SELECT artifacts in
--   public. These were given RLS earlier today (PART C of
--   20260602_fix_security_definer_views_and_rls_recurrence.sql, RC5) as an
--   interim "secure rather than drop" measure. This migration completes the
--   intended cleanup: they are stale, redundant backups with ZERO functional
--   code references (only auto-generated schema docs reference them, which
--   regenerate).
--
-- VERIFIED SAFE (against the LIVE consolidated database, 2026-06-02):
--   Each of the 4 tables has 0 inbound foreign keys and 0 dependent views.
--   Row counts at capture time:
--     - public.backup_leo_subagent_handoffs  (1 row)
--     - public.backup_leo_sub_agent_handoffs  (1 row)
--     - public.backup_leo_feature_flag_audit  (12 rows)
--     - public.backup_leo_feature_flag_audit_log  (6 rows)
--
-- REVERSIBLE: The companion rollback file
--   (20260602_drop_stale_backup_leo_tables_rollback.sql) contains the captured
--   CREATE TABLE DDL + INSERT statements for ALL rows, so both STRUCTURE and
--   DATA are fully restorable. (RLS policies are NOT restored by the rollback;
--   these are stale backup tables and RLS on them was itself only an interim
--   measure.)
--
-- Idempotent: DROP TABLE IF EXISTS. CASCADE is belt-and-suspenders (no dependents
-- exist per the verification above).
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public."backup_leo_subagent_handoffs" CASCADE;
DROP TABLE IF EXISTS public."backup_leo_sub_agent_handoffs" CASCADE;
DROP TABLE IF EXISTS public."backup_leo_feature_flag_audit" CASCADE;
DROP TABLE IF EXISTS public."backup_leo_feature_flag_audit_log" CASCADE;

-- Verification: assert all 4 tables are gone (to_regclass returns NULL).
DO $$
DECLARE
  remaining text;
BEGIN
  IF (
      to_regclass('public.backup_leo_subagent_handoffs') IS NOT NULL
      OR to_regclass('public.backup_leo_sub_agent_handoffs') IS NOT NULL
      OR to_regclass('public.backup_leo_feature_flag_audit') IS NOT NULL
      OR to_regclass('public.backup_leo_feature_flag_audit_log') IS NOT NULL
  ) THEN
    remaining := concat_ws(', ',
      CASE WHEN to_regclass('public.backup_leo_subagent_handoffs') IS NOT NULL THEN 'backup_leo_subagent_handoffs' END,
      CASE WHEN to_regclass('public.backup_leo_sub_agent_handoffs') IS NOT NULL THEN 'backup_leo_sub_agent_handoffs' END,
      CASE WHEN to_regclass('public.backup_leo_feature_flag_audit') IS NOT NULL THEN 'backup_leo_feature_flag_audit' END,
      CASE WHEN to_regclass('public.backup_leo_feature_flag_audit_log') IS NOT NULL THEN 'backup_leo_feature_flag_audit_log' END
    );
    RAISE EXCEPTION 'Drop verification FAILED - still present: %', remaining;
  END IF;
  RAISE NOTICE 'Drop verification PASSED: all 4 backup_leo_* tables are gone.';
END $$;

COMMIT;
