-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001 (retention substrate)
--
-- Column-explicit revert: drops exactly the two new tables (and their indexes with them).
-- WARNING: dropping retention_archive discards any ARCHIVED rows — restore them to their
-- source tables FIRST if any enforcement --apply has run (SELECT row_data FROM
-- retention_archive WHERE source_table='...' → re-insert), or accept the loss explicitly.
-- Apply via: node scripts/apply-migration.js database/migrations/20260610_retention_substrate_DOWN.sql

SELECT pg_advisory_xact_lock(hashtext('retention_substrate_20260610'));

DROP TABLE IF EXISTS retention_archive;
DROP TABLE IF EXISTS retention_runs;

DO $retention_down_post$
DECLARE
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN ('retention_archive','retention_runs');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'retention substrate DOWN post-assert failed: % tables still present', v_cnt;
  END IF;
END;
$retention_down_post$;
