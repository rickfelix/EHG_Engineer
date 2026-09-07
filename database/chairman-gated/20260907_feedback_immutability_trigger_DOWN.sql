-- ROLLBACK for 20260907_feedback_immutability_trigger.sql
-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E (FR-2)
--
-- Drops ONLY the triggers/functions this migration added -- never the feedback table itself,
-- which pre-existed this SD and carries production rows.

BEGIN;

DROP TRIGGER IF EXISTS feedback_no_truncate_trg ON public.feedback;
DROP TRIGGER IF EXISTS feedback_no_delete_trg ON public.feedback;
DROP TRIGGER IF EXISTS feedback_no_update ON public.feedback;

DROP FUNCTION IF EXISTS public.feedback_no_truncate();
DROP FUNCTION IF EXISTS public.feedback_no_delete();
DROP FUNCTION IF EXISTS public.feedback_freeze();

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.feedback'::regclass AND tgname LIKE 'feedback_no_%') THEN
    RAISE EXCEPTION 'feedback DOWN failed: a feedback_no_% trigger still exists';
  END IF;
  ASSERT to_regclass('public.feedback') IS NOT NULL,
    'feedback table must still exist after this DOWN -- it pre-existed this SD and is never dropped';
  RAISE NOTICE 'feedback DOWN verified: immutability triggers/functions removed, table intact';
END
$verify$;

COMMIT;
