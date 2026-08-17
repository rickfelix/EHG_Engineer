-- DOWN migration for database/chairman-gated/20260817_restore_feedback_permissive_insert.sql
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except to reverse a completed apply of
-- the paired UP migration.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Drops venture_user_insert_feedback_authenticated_restore. Does NOT revert
-- anon_feedback_ingress_bounds's TO PUBLIC scope -- that scope was already the live state before
-- the UP file ran (the UP file's step 2 was a re-pin/assertion of the existing state, not a
-- widening it introduced), so there is nothing to undo there. Wrapped in its own transaction with
-- a trailing PostgREST reload, matching the UP file's apply block.

BEGIN;

-- Same bounded-wait rationale as the UP file: DROP POLICY takes ACCESS EXCLUSIVE on public.feedback.
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS venture_user_insert_feedback_authenticated_restore ON public.feedback;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
        AND p.polname = 'venture_user_insert_feedback_authenticated_restore') <> 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback_authenticated_restore still present in pg_policies';
  END IF;

  -- anon_feedback_ingress_bounds must survive this rollback unchanged (still RESTRICTIVE, INSERT,
  -- TO PUBLIC) -- this file must not collaterally touch the sibling policy it never introduced.
  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
        AND p.polname = 'anon_feedback_ingress_bounds' AND p.polcmd = 'a' AND NOT p.polpermissive
        AND 0 = ANY(p.polroles)) <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon_feedback_ingress_bounds was unexpectedly altered by this rollback';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
