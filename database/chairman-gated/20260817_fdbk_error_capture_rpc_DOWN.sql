-- Rollback for 20260817_fdbk_error_capture_rpc.sql (SD-FDBK-FIX-EHG-ERRORCAPTUREPROVIDER-SENDS-001).
-- Drops the new RPC, its internal storm-check helper, and the new partial unique index.
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. Only run after the paired UP file has actually been applied.

BEGIN;

SET LOCAL lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.check_error_capture_storm();
DROP INDEX IF EXISTS idx_feedback_error_capture_hash;

-- Deliberately NOT deleted: any public.feedback rows this RPC already wrote (including the storm
-- watermark row) -- this rollback removes the write PATH, not historical data. If those rows must
-- be purged too, do so as an explicit, separately-reviewed follow-up, not implicitly here.

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-ROLLBACK VERIFICATION
-- ============================================================
--   A live anon or authenticated call to fn_submit_error_capture(...) must fail with PGRST202
--   (function not found), matching the pre-apply baseline state.
