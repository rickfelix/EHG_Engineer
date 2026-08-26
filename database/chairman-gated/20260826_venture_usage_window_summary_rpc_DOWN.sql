-- Rollback for 20260826_venture_usage_window_summary_rpc.sql
-- SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C

BEGIN;

DROP FUNCTION IF EXISTS public.fn_venture_usage_window_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

COMMIT;
