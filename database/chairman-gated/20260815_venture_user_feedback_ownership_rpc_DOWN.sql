-- DOWN migration for database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql
-- QF-20260816-304: extracts that file's own inline commented ROLLBACK block (lines 165-179) into
-- an executable, staged file, so a real rollback does not depend on someone hand-pasting a comment.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except to reverse a completed apply of
-- the paired UP migration above.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Additive except for the one DROP FUNCTION, safe to reverse in one pass. Re-creates
-- venture_user_insert_feedback with the EXACT WITH CHECK clause it had before the UP migration
-- dropped it (byte-identical to the policy definition in database/migrations/
-- 20260401_venture_user_feedback_channel.sql, as re-asserted by the UP file's own header). Wrapped
-- in its own transaction with a trailing PostgREST reload, matching the UP file's apply block, so a
-- rollback leaves the schema cache consistent with pg_catalog immediately rather than until
-- PostgREST's own next reload cycle (SEC-L2 convention).

BEGIN;

-- Same bounded-wait rationale as the UP file's SEC-L1 guard: CREATE POLICY takes ACCESS EXCLUSIVE
-- on public.feedback, same as the DROP POLICY it is reversing.
SET LOCAL lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, service_role;
DROP FUNCTION IF EXISTS public.fn_submit_venture_user_feedback(UUID, TEXT, TEXT, TEXT, TEXT);
GRANT EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_feedback_rate_limit(uuid) TO anon, authenticated;
CREATE POLICY venture_user_insert_feedback ON public.feedback
  FOR INSERT TO anon
  WITH CHECK (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
    AND venture_exists_and_active(venture_id)
    AND (NOT check_feedback_rate_limit(venture_id))
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
