-- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E
--
-- Adds per-field audit triggers to 4 previously-unaudited tables (quick_fixes,
-- claude_sessions, feedback, chairman_ratifications) and 3 CHECK constraints
-- pairing quick_fixes.disposition with its required target/status, closing a
-- 0%-audit-coverage gap and 16 historical status=closed/disposition=NULL rows
-- (re-measured live 2026-09-03/04; the SD's original citation of 15 was stale).
--
-- WHY A NEW FUNCTION INSTEAD OF REUSING governance_audit_trigger(): that
-- existing function references NEW.created_by/NEW.updated_by directly. Of the
-- 4 target tables, only quick_fixes has created_by, and NONE has updated_by --
-- a direct NEW.col reference on a RECORD-typed trigger arg is resolved at
-- RUNTIME, so this would error, not merely return NULL. audit_trigger_generic()
-- below uses to_jsonb(NEW)->>'col' extraction instead, which safely returns
-- NULL for a column the table doesn't have.
--
-- ACTOR RESOLUTION: changed_by is the first non-null value found by trying, in
-- order, 8 candidate columns across the 4 tables' actual (verified live)
-- schemas: disposed_by, verified_by, triaged_by, assigned_to, promoted_by,
-- scribe_seat, created_by, session_id/claiming_session_id -- falling through to
-- the literal 'SYSTEM' only if none of those exist or are non-null on the row.
--
-- AUDIT WRITE IS BEST-EFFORT, NEVER BLOCKING (ROOT-FIX-TRG doctrine, see the
-- BEGIN...EXCEPTION WHEN OTHERS block inside the function below): public.
-- feedback has live, permissive anon-role INSERT policies, while
-- governance_audit_log has had no anon INSERT policy since the 2025-12-17
-- hardening -- an unguarded trigger would abort a legitimate anon feedback
-- submission on every RLS-denied audit write. Found by the SECURITY sub-agent
-- at EXEC-TO-PLAN (row d896818a-9fa4-4791-90d8-1613f25027a0, finding SEC-1).
--
-- CHAIRMAN_RATIFICATIONS IS INSERT-ONLY BY DESIGN: this table already carries
-- chairman_ratifications_no_update / _no_delete / _no_truncate guard triggers
-- (append-only, immutable once written). An AFTER UPDATE OR DELETE audit
-- trigger on it would be structurally live but never fire in practice, since
-- the existing guards abort the statement first -- so, to avoid shipping dead
-- code presented as functioning, its audit trigger is INSERT-only. The other
-- 3 tables get the full INSERT/UPDATE/DELETE trigger.
--
-- BACKFILL (must run BEFORE the 3 new CHECK constraints are added, or they
-- fail against live data):
--   1. Two quick_fixes rows are misclassified disposition='duplicate_of' but
--      were actually superseded by a completed SD (not a duplicate QF) --
--      duplicate_of_id is a TEXT FK to quick_fixes(id) and cannot reference an
--      SD, so 'duplicate_of' is the wrong disposition for these two.
--      Reclassified to 'premise_resolved' (the SD resolved the premise).
--   2. Three quick_fixes rows are correctly disposition='duplicate_of' but
--      were missing duplicate_of_id; each already names its actual duplicate
--      target QF in disposition_reason_code (verified live to exist) --
--      backfilled directly.
--   3. Of the 16 status='closed' AND disposition IS NULL rows: 2 have direct,
--      specific evidentiary support for an EXISTING enum value (a chairman-
--      authorized escalation with both escalated_to_sd_id and resolution_sd_id
--      set -> 'promoted'; an explicit "VERIFIED ALREADY-RESOLVED" note ->
--      'premise_resolved'). The remaining 14 describe outcomes the existing
--      5-value enum has no honest match for (e.g. "PREMISE REFUTED",
--      "SUPERSEDED", or carry no note at all) -- fabricating a specific
--      disposition for these would misrepresent the historical record, so the
--      enum is widened with a 6th, honest value: 'legacy_grandfathered'.
--      Their EXISTING reason/verification_notes text is left completely
--      untouched (it already documents what happened); a short backfill note
--      is appended to `reason` only, rather than re-typing the original text
--      as a literal-escaped excerpt in this migration file, which would be
--      fragile against embedded quotes/apostrophes in arbitrary historical
--      free text.
--
-- Created: 2026-09-04

BEGIN;

-- ============================================================
-- 1. Generic, jsonb-extraction-based audit trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_generic()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_new jsonb;
  v_old jsonb;
  v_record_id text;
  v_changed_by text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := v_old->>'id';
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := v_new->>'id';
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := v_new->>'id';
  END IF;

  v_changed_by := COALESCE(
    v_new->>'disposed_by',
    v_old->>'disposed_by',
    v_new->>'verified_by',
    v_old->>'verified_by',
    v_new->>'triaged_by',
    v_old->>'triaged_by',
    v_new->>'assigned_to',
    v_old->>'assigned_to',
    v_new->>'promoted_by',
    v_old->>'promoted_by',
    v_new->>'scribe_seat',
    v_old->>'scribe_seat',
    v_new->>'created_by',
    v_old->>'created_by',
    v_new->>'session_id',
    v_old->>'session_id',
    v_new->>'claiming_session_id',
    v_old->>'claiming_session_id',
    'SYSTEM'
  );

  -- ROOT-FIX-TRG doctrine (docs/audits/SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001.md):
  -- an AFTER-trigger side-effect write must never be allowed to abort the
  -- primary DML it rides on. This is not precautionary here -- it is a
  -- required fix, found by the SECURITY sub-agent at EXEC-TO-PLAN review
  -- (row d896818a-9fa4-4791-90d8-1613f25027a0, finding SEC-1): public.feedback
  -- carries two live, permissive anon-role INSERT policies
  -- (telegram_bot_insert_feedback, venture_user_insert_feedback -- see
  -- 20260802_bound_anon_feedback_ingress.sql), while governance_audit_log has
  -- had NO anon INSERT policy since the 2025-12-17 hardening
  -- (20251217_rls_security_hardening.sql Step 5 dropped
  -- anon_insert_governance_audit_log and replaced it with an
  -- authenticated+fn_is_service_role()-only policy -- itself the fix for an
  -- identical 2025-11-07 incident on product_requirements_v2, see
  -- 2025-11-07_add_anon_insert_governance_audit_log.sql). Without this guard,
  -- an unguarded AFTER trigger firing for an anon-role feedback INSERT would
  -- hit that RLS denial and abort the caller's entire feedback submission --
  -- a real availability regression, not a hypothetical one. Existing sibling
  -- functions (fn_auto_close_deliverables_on_sd_completion,
  -- fn_auto_close_quick_fixes_on_sd_completion) already use this exact
  -- `EXCEPTION WHEN OTHERS THEN RAISE WARNING ... RETURN NEW` shape.
  BEGIN
    INSERT INTO public.governance_audit_log (
      table_name, record_id, operation, old_values, new_values, changed_by, changed_at
    ) VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, v_changed_by, now()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_trigger_generic: governance_audit_log write failed for %.% (op=%): %',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. Attach triggers (idempotent: DROP IF EXISTS + CREATE)
-- ============================================================

DROP TRIGGER IF EXISTS audit_quick_fixes ON public.quick_fixes;
CREATE TRIGGER audit_quick_fixes
  AFTER INSERT OR UPDATE OR DELETE ON public.quick_fixes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();

DROP TRIGGER IF EXISTS audit_claude_sessions ON public.claude_sessions;
CREATE TRIGGER audit_claude_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.claude_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();

DROP TRIGGER IF EXISTS audit_feedback ON public.feedback;
CREATE TRIGGER audit_feedback
  AFTER INSERT OR UPDATE OR DELETE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();

-- INSERT-only: see header note. UPDATE/DELETE are already blocked by this
-- table's own immutability guard triggers, so an AFTER UPDATE OR DELETE
-- clause here would be a structurally-live but never-firing no-op.
DROP TRIGGER IF EXISTS audit_chairman_ratifications ON public.chairman_ratifications;
CREATE TRIGGER audit_chairman_ratifications
  AFTER INSERT ON public.chairman_ratifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();

-- ============================================================
-- 3. Backfill (must precede the CHECK constraints below)
-- ============================================================

-- 3a. Two 'duplicate_of' rows actually superseded by a completed SD, not a
-- duplicate QF -- duplicate_of_id (FK to quick_fixes) cannot hold an SD
-- reference, so the disposition itself was wrong. Reclassify.
UPDATE quick_fixes
SET disposition = 'premise_resolved'
WHERE id IN ('QF-20260728-471', 'QF-20260801-736')
  AND disposition = 'duplicate_of'
  AND duplicate_of_id IS NULL;

-- 3b. Three 'duplicate_of' rows missing duplicate_of_id, each naming its real
-- target QF in disposition_reason_code (verified live to exist).
UPDATE quick_fixes SET duplicate_of_id = 'QF-20260801-785'
WHERE id = 'QF-20260728-209' AND disposition = 'duplicate_of' AND duplicate_of_id IS NULL;

UPDATE quick_fixes SET duplicate_of_id = 'QF-20260719-986'
WHERE id = 'QF-20260727-004' AND disposition = 'duplicate_of' AND duplicate_of_id IS NULL;

UPDATE quick_fixes SET duplicate_of_id = 'QF-20260818-249'
WHERE id = 'QF-20260727-372' AND disposition = 'duplicate_of' AND duplicate_of_id IS NULL;

-- 3c. Widen the disposition enum BEFORE using the new value below.
ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_disposition_check;
ALTER TABLE quick_fixes ADD CONSTRAINT quick_fixes_disposition_check
  CHECK (disposition IN (
    'premise_resolved',
    'premise_unverified_stale',
    'duplicate_of',
    're_verified',
    'promoted',
    'legacy_grandfathered'  -- new: closed before disposition tracking existed,
                            -- no evidence to support a specific existing value
  ));

-- 3d. Two closed/disposition-null rows with direct evidentiary support.
UPDATE quick_fixes
SET disposition = 'premise_resolved',
    reason = COALESCE(reason, '') ||
      ' [BACKFILLED 2026-09-04 SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E]: verification_notes already documents "VERIFIED ALREADY-RESOLVED" -- disposition backfilled to match.'
WHERE id = 'QF-20260727-705' AND status = 'closed' AND disposition IS NULL;

UPDATE quick_fixes
SET disposition = 'promoted',
    reason = COALESCE(reason, '') ||
      ' [BACKFILLED 2026-09-04 SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E]: escalated_to_sd_id and resolution_sd_id were already set (chairman-verbal-authorized escalation, see verification_notes) -- disposition backfilled to match.'
WHERE id = 'QF-20260719-281' AND status = 'closed' AND disposition IS NULL;

-- 3e. Remaining 14 closed/disposition-null rows: no evidence supports a
-- specific existing enum value (several are "PREMISE REFUTED" or "SUPERSEDED"
-- outcomes distinct from the 5 existing meanings, some carry no note at all).
-- Grandfathered honestly rather than guessed. Original reason/verification_notes
-- text is left untouched; a note is appended to `reason` only.
UPDATE quick_fixes
SET disposition = 'legacy_grandfathered',
    reason = COALESCE(reason, '') ||
      ' [BACKFILLED 2026-09-04 SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E]: closed before disposition tracking was enforced; existing verification_notes/reason on this row (if any) documents the original outcome, but does not map cleanly to an existing disposition value -- grandfathered rather than guessed.'
WHERE id IN (
  'QF-20260719-635', 'QF-20260610-257', 'QF-20260611-506', 'QF-20260711-624',
  'QF-20260714-549', 'QF-20260611-977', 'QF-20260719-464', 'QF-20260726-405',
  'QF-20260807-444', 'QF-20260808-403', 'QF-20260903-052', 'QF-20260824-216',
  'QF-20260824-315', 'QF-20260713-422'
)
AND status = 'closed' AND disposition IS NULL;

-- ============================================================
-- 4. New CHECK constraints (NOT VALID + VALIDATE, backfill above must be
--    complete and correct or VALIDATE below fails the migration)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quick_fixes_duplicate_of_pairing') THEN
    ALTER TABLE quick_fixes ADD CONSTRAINT quick_fixes_duplicate_of_pairing
      CHECK (disposition IS DISTINCT FROM 'duplicate_of' OR duplicate_of_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE quick_fixes VALIDATE CONSTRAINT quick_fixes_duplicate_of_pairing;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quick_fixes_promoted_target_pairing') THEN
    ALTER TABLE quick_fixes ADD CONSTRAINT quick_fixes_promoted_target_pairing
      CHECK (disposition IS DISTINCT FROM 'promoted' OR escalated_to_sd_id IS NOT NULL OR resolution_sd_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE quick_fixes VALIDATE CONSTRAINT quick_fixes_promoted_target_pairing;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quick_fixes_closed_requires_disposition') THEN
    ALTER TABLE quick_fixes ADD CONSTRAINT quick_fixes_closed_requires_disposition
      CHECK (status IS DISTINCT FROM 'closed' OR disposition IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE quick_fixes VALIDATE CONSTRAINT quick_fixes_closed_requires_disposition;

COMMIT;

-- Rollback:
-- DROP TRIGGER IF EXISTS audit_quick_fixes ON public.quick_fixes;
-- DROP TRIGGER IF EXISTS audit_claude_sessions ON public.claude_sessions;
-- DROP TRIGGER IF EXISTS audit_feedback ON public.feedback;
-- DROP TRIGGER IF EXISTS audit_chairman_ratifications ON public.chairman_ratifications;
-- DROP FUNCTION IF EXISTS public.audit_trigger_generic();
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_duplicate_of_pairing;
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_promoted_target_pairing;
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_closed_requires_disposition;
-- Note: the enum widen and backfill are not mechanically reversible without
-- re-nulling the backfilled rows' disposition, which would itself reintroduce
-- the original gap -- intentionally not scripted here.
