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
-- POST-EXEC ADVERSARIAL REVIEW FIXES (independent /ship deep-tier review,
-- found after the above was already fixed): (a) the function is now
-- SECURITY DEFINER -- without it, every anon/authenticated write's audit
-- INSERT would be RLS-denied and silently swallowed by the very guard above,
-- defeating audit coverage for exactly the untrusted actors it exists to
-- cover; (b) claude_sessions' UPDATE audit is now a separate, WHEN-filtered
-- trigger restricted to lifecycle/ownership columns, not every heartbeat
-- tick (measured live: 5.9M updates on that table already); (c) the 3 new
-- CHECK constraints' existence checks are now scoped by conrelid, not name
-- alone.
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

-- SECURITY DEFINER is required, not optional: governance_audit_log has RLS
-- enabled with only a {service_role} INSERT policy (2025-12-17 hardening).
-- Without SECURITY DEFINER this function runs as INVOKER, so every anon or
-- plain-authenticated write (e.g. the anon_feedback_ingress_bounds INSERT
-- path on public.feedback) would have its audit write RLS-denied and
-- silently swallowed by the EXCEPTION guard below -- defeating audit
-- coverage for exactly the untrusted actors it exists to cover, while
-- LOOKING instrumented. Found by an independent adversarial review of this
-- PR (CRITICAL finding). search_path is already pinned via the SET clause,
-- which is the standard mitigation for the classic SECURITY DEFINER
-- search_path-hijack vector. Matches existing repo precedent:
-- fn_venture_stages_audit_trigger and fn_gate_boundary_config_audit_trigger
-- are both already SECURITY DEFINER for the identical reason.
CREATE OR REPLACE FUNCTION public.audit_trigger_generic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  -- KNOWN, ACCEPTED LIMITATION (adversarial review WARNING, not fixed here):
  -- changed_by is derived from the row's own data, not an authenticated
  -- identity (no auth.uid()/current_user in this system's actor model --
  -- every actor column across this repo is a plain text field). On an
  -- anon-writable table (feedback), a caller could set e.g. assigned_to to
  -- an arbitrary string and have it appear as changed_by. This adds no NEW
  -- exposure: new_values already captures the identical, equally-spoofable
  -- field verbatim, so changed_by is a convenience summary of already-
  -- visible row content, not an independent trust signal. A real fix would
  -- require an authenticated-identity actor model this system doesn't have.
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
  AFTER INSERT OR DELETE ON public.claude_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_generic();

-- UPDATE gets a SEPARATE trigger with a WHEN filter (a single combined
-- INSERT/UPDATE/DELETE trigger cannot carry an UPDATE-only WHEN condition
-- referencing OLD, since OLD is undefined for the INSERT event). This table
-- receives a heartbeat-driven UPDATE on nearly every fleet tick (measured
-- live: 5.9M updates vs 6.4K inserts, ~1.5KB per full-row jsonb snapshot) --
-- an unfiltered AFTER UPDATE trigger would grow governance_audit_log
-- (already ~4.9GB) unboundedly on pure liveness noise. Restricted to the
-- columns that matter for governance/accountability -- claim/session
-- lifecycle and ownership -- excluding tool/heartbeat telemetry columns
-- (heartbeat_at, current_tool*, commits_since_claim, process_alive_at,
-- etc.) that churn on every tick. Found by an independent adversarial
-- review of this PR (CRITICAL finding).
DROP TRIGGER IF EXISTS audit_claude_sessions_update ON public.claude_sessions;
CREATE TRIGGER audit_claude_sessions_update
  AFTER UPDATE ON public.claude_sessions
  FOR EACH ROW
  WHEN (
    OLD.sd_key IS DISTINCT FROM NEW.sd_key
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.claimed_at IS DISTINCT FROM NEW.claimed_at
    OR OLD.released_at IS DISTINCT FROM NEW.released_at
    OR OLD.released_reason IS DISTINCT FROM NEW.released_reason
    OR OLD.stale_reason IS DISTINCT FROM NEW.stale_reason
    OR OLD.current_phase IS DISTINCT FROM NEW.current_phase
    OR OLD.worktree_branch IS DISTINCT FROM NEW.worktree_branch
    OR OLD.parent_session_id IS DISTINCT FROM NEW.parent_session_id
  )
  EXECUTE FUNCTION public.audit_trigger_generic();

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

-- Each existence check is scoped by conrelid (this table only), not name
-- alone: pg_constraint names are unique per-relation, not globally, so an
-- unscoped WHERE conname=... could match a same-named constraint on a
-- different table, skip the ADD, and then fail the unconditional VALIDATE
-- below. Found by an independent adversarial review of this PR (INFO finding).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quick_fixes_duplicate_of_pairing' AND conrelid = 'public.quick_fixes'::regclass
  ) THEN
    ALTER TABLE quick_fixes ADD CONSTRAINT quick_fixes_duplicate_of_pairing
      CHECK (disposition IS DISTINCT FROM 'duplicate_of' OR duplicate_of_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE quick_fixes VALIDATE CONSTRAINT quick_fixes_duplicate_of_pairing;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quick_fixes_promoted_target_pairing' AND conrelid = 'public.quick_fixes'::regclass
  ) THEN
    ALTER TABLE quick_fixes ADD CONSTRAINT quick_fixes_promoted_target_pairing
      CHECK (disposition IS DISTINCT FROM 'promoted' OR escalated_to_sd_id IS NOT NULL OR resolution_sd_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE quick_fixes VALIDATE CONSTRAINT quick_fixes_promoted_target_pairing;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quick_fixes_closed_requires_disposition' AND conrelid = 'public.quick_fixes'::regclass
  ) THEN
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
-- DROP TRIGGER IF EXISTS audit_claude_sessions_update ON public.claude_sessions;
-- DROP TRIGGER IF EXISTS audit_feedback ON public.feedback;
-- DROP TRIGGER IF EXISTS audit_chairman_ratifications ON public.chairman_ratifications;
-- DROP FUNCTION IF EXISTS public.audit_trigger_generic();
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_duplicate_of_pairing;
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_promoted_target_pairing;
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS quick_fixes_closed_requires_disposition;
-- Note: the enum widen and backfill are not mechanically reversible without
-- re-nulling the backfilled rows' disposition, which would itself reintroduce
-- the original gap -- intentionally not scripted here.
