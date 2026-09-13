-- SD-LEO-FIX-CLOSE-ANON-KEY-001 / FR-3 -- DROP POLICY anon_read_strategic_directives_v2
-- ON public.strategic_directives_v2.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CHAIRMAN-APPROVED 2026-09-07 ~01:35Z: verbal at the Adam terminal, quote: "apply the
-- strategic directives read-policy migration." Scribed by Adam session bc762fa4 under the 3c
-- ceremony; content unchanged from the merged file except this marker block.
-- @approved-by: codestreetlabs@gmail.com
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHY THIS IS CHAIRMAN-GATED, NOT WORKER-APPLIED: this is a permission REMOVAL on a live,
-- 6176-row production table, not additive DDL. A worker self-apply or a delegated (Adam) apply is
-- a CONST-002 / 3b violation regardless of how well-tested the change is. Per this SD's own scope
-- note, this file is authored so the chairman can apply it via the 3c scribe ceremony
-- (see this directory's README.md "Ceremony guard order"); it is never executed by this SD's own
-- implementation work.
--
-- ORDERING PRECONDITION (why this must apply AFTER FR-1, never before): the policy this file drops
-- is what src/services/realtime-dashboard.js and src/services/database-loader/connections.ts
-- depended on before FR-1 moved both to SUPABASE_SERVICE_ROLE_KEY. Dropping this policy before
-- FR-1 lands repeats the 2025-12-17/18 outage (the realtime dashboard could not read SDs, and the
-- policy was re-added the next day as an emergency fix). FR-1 has already landed in this SD's own
-- PR -- confirm via `git log --oneline -- src/services/realtime-dashboard.js
-- src/services/database-loader/connections.ts` before applying this file, and re-run the FR-2 live
-- probe (node scripts/anon-read-strategic-directives-probe.mjs) as a smoke check on the realtime
-- dashboard per the SD's smoke_test_steps.
--
-- SAME-CONSTRAINT COORDINATION (live pg_policies read, captured 2026-09-06, 7 total policies on
-- this table -- this file touches exactly ONE of them and leaves the other six untouched):
--   anon_read_strategic_directives_v2            SELECT  anon           USING (true)              <- DROPPED here
--   strategic_directives_v2_service_role_access   ALL     authenticated  USING (fn_is_service_role())  <- KEPT, unrelated to anon
--   authenticated_read_strategic_directives_v2    SELECT  authenticated  USING (true)              <- KEPT
--   service_role_all_strategic_directives_v2      ALL     service_role   USING (true)              <- KEPT
--   venture_insert_strategic_directives_v2        INSERT  authenticated  WITH CHECK (venture_id IS NULL OR fn_user_has_venture_access(venture_id))  <- KEPT
--   venture_select_strategic_directives_v2        SELECT  authenticated  USING (venture_id IS NULL OR fn_user_has_venture_access(venture_id))       <- KEPT
--   venture_update_strategic_directives_v2        UPDATE  authenticated  USING/WITH CHECK (venture_id IS NULL OR fn_user_has_venture_access(venture_id)) <- KEPT
-- The name "strategic_directives_v2_service_role_access" is misleading (it is scoped TO
-- authenticated, gated by fn_is_service_role()) but is NOT this file's concern -- named here only
-- so the applier does not mistake it for the anon policy being dropped.
--
-- ROLLBACK (exact inverse, captured from the live definition at authoring time -- re-create if
-- this file's DROP must be undone; re-verify against live pg_policies before trusting this text as
-- current, per this directory's own standing caveat that a captured predicate is context to diff
-- against, not an authority to restore from):
--
--   CREATE POLICY anon_read_strategic_directives_v2
--     ON public.strategic_directives_v2
--     FOR SELECT
--     TO anon
--     USING (true);
--
-- FR-4 (post-apply, separate action, not part of this file): once applied, record a
-- provenance-stamped readback on the SD -- pg_policies for this table (expect the anon policy
-- gone, the other six unchanged) plus a fresh anon-key count read (expect 0) -- per ratification
-- 6c263823 (producer, run id, content hash).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
       AND policyname = 'anon_read_strategic_directives_v2'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: anon_read_strategic_directives_v2 does not exist on public.strategic_directives_v2 -- already dropped, or renamed. Do not proceed blind; re-verify live pg_policies before re-running this file.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
       AND policyname = 'strategic_directives_v2_service_role_access'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: strategic_directives_v2_service_role_access is absent -- the policy this SD keeps as the service-role access path is missing; investigate before dropping the anon policy.';
  END IF;
END
$precondition$;

DROP POLICY anon_read_strategic_directives_v2 ON public.strategic_directives_v2;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
       AND policyname = 'anon_read_strategic_directives_v2'
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED: anon_read_strategic_directives_v2 still exists after DROP -- transaction should be aborted, but fail loudly rather than trust an empty catch.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
       AND policyname = 'strategic_directives_v2_service_role_access'
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED: strategic_directives_v2_service_role_access was unexpectedly removed by this migration -- it must be untouched.';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2') <> 6 THEN
    RAISE EXCEPTION 'VERIFY_FAILED: expected exactly 6 remaining policies on strategic_directives_v2 after this DROP (7 measured at authoring time, minus 1), found %. Live policy count drifted since authoring -- investigate before trusting this migration''s scope note.',
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2');
  END IF;
END
$verify$;
