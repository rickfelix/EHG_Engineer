-- SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001 (FR-7)
--
-- STAGED ONLY -- NOT APPLIED BY THIS SD. Chairman-gated DDL, applied at a
-- chairman ceremony per this SD's original decision framework
-- (metadata.apply_gate: "chairman ceremony for the DDL -- do not apply
-- inline").
--
-- Registers test_results on the supabase_realtime publication. Confirmed live
-- via a direct pg_publication_tables query (not REST) that test_results,
-- test_runs, and test_failures are ALL 0-of-21 currently-published tables --
-- without this, lib/rca-runtime-triggers.js's monitorTestFailures() retargeted
-- subscription (this SD's code fix) would still never receive events, even
-- though the subscription and query logic are both correct.
--
-- Idempotency: ALTER PUBLICATION ... ADD TABLE throws 42710 if the table is
-- already a publication member. Guarded so a re-run of this staged file is
-- safe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'test_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.test_results;
  END IF;
END
$$;
