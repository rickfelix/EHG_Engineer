-- ROLLBACK for 20260912_feedback_no_update_lifecycle_allowlist.sql
-- SD-LEO-INFRA-FEEDBACK-LIFECYCLE-UPDATE-ALLOWLIST-001
--
-- Restores feedback_no_update to the 20260907 unconditional-reject behavior (drop+recreate the
-- TRIGGER with no WHEN clause) -- never touches feedback_freeze() (unchanged throughout both
-- migrations), feedback_no_delete_trg, or feedback_no_truncate_trg. A revert is a clean,
-- zero-data-loss return to pre-allowlist behavior: this migration never deleted or mutated any
-- row, and reverting cannot either.

BEGIN;

DROP TRIGGER IF EXISTS feedback_no_update ON public.feedback;
CREATE TRIGGER feedback_no_update
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_freeze();

ALTER TABLE public.feedback ENABLE ALWAYS TRIGGER feedback_no_update;

COMMENT ON TABLE public.feedback IS
  'Append-only as of SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E: no UPDATE/DELETE/TRUNCATE is '
  'permitted post-insert (feedback_no_update / feedback_no_delete_trg / feedback_no_truncate_trg, '
  'all ENABLE ALWAYS). A correction is recorded as a NEW row, never an edit to an existing one.';

DO $verify$
DECLARE
  probe_id uuid;
BEGIN
  ASSERT to_regclass('public.feedback') IS NOT NULL, 'feedback table does not exist';

  BEGIN
    INSERT INTO public.feedback (type, source_application, source_type, title)
    VALUES ('issue', 'terminal:probe-verify', 'manual_feedback',
            'probe: SD-LEO-INFRA-FEEDBACK-LIFECYCLE-UPDATE-ALLOWLIST-001 DOWN verify')
    RETURNING id INTO probe_id;

    -- Post-rollback, even a pure lifecycle UPDATE must be rejected again (unconditional).
    BEGIN
      UPDATE public.feedback SET status = 'triaged' WHERE id = probe_id;
      RAISE EXCEPTION 'feedback DOWN: GUARD DID NOT FIRE -- a lifecycle UPDATE was ACCEPTED post-rollback.' USING ERRCODE = 'P0101';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    RAISE EXCEPTION 'internal: discard verify-block probe row (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN NULL;
  END;

  RAISE NOTICE 'feedback DOWN verified: feedback_no_update rejects ALL updates again, unconditionally';
END
$verify$;

COMMIT;
