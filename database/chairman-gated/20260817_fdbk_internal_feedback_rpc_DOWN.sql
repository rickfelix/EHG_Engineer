-- @approved-by:
-- DOWN migration for 20260817_fdbk_internal_feedback_rpc.sql
-- SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001
--
-- Drops both new functions and their grants. Additive-only UP migration (no existing objects were
-- altered), so this DOWN is a clean, symmetric removal — no data migration or column reversion
-- needed. Rows already inserted via fn_submit_internal_feedback remain in public.feedback
-- unaffected (this DOWN does not delete data, only the write path).
--
-- Reverting this DOWN reintroduces the standing defect: FeedbackWidget.tsx submissions will again
-- fail unconditionally once the frontend change (which calls this RPC) has also been deployed —
-- coordinate reverting the frontend change together with this DOWN if ever needed.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.fn_submit_internal_feedback(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_internal_feedback_rate_limit(uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;
