-- Rollback for 20260817_fdbk_error_capture_rpc.sql (SD-FDBK-FIX-EHG-ERRORCAPTUREPROVIDER-SENDS-001).
-- Drops the new RPC, its internal storm-check helper, and the new partial unique index.
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. Only run after the paired UP file has actually been applied.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- No standalone REVOKE here (confirmation-review finding, post-PLAN-TO-LEAD): DROP FUNCTION removes
-- the function's ACL along with it, and an explicit REVOKE against a not-yet-applied or
-- already-rolled-back function 42883s with no IF-EXISTS form available, aborting this whole
-- transaction non-idempotently. DROP FUNCTION IF EXISTS is the correct, idempotent single step.
DROP FUNCTION IF EXISTS public.fn_submit_error_capture(TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.check_error_capture_storm();
-- Schema-qualified (confirmation-review finding): under a migration runner that sets search_path='',
-- an unqualified DROP INDEX IF EXISTS silently no-ops on a miss instead of erroring, orphaning the
-- index on rollback rather than failing loud.
DROP INDEX IF EXISTS public.idx_feedback_error_capture_hash;

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
