-- SD-LEO-INFRA-FEEDBACK-LIFECYCLE-UPDATE-ALLOWLIST-001 -- narrow feedback_no_update to a
-- WHEN-clause content-column guard, per chairman decision ba4055b7 (option A, recommended,
-- carried by Adam 2026-09-12). Authoring only -- apply strictly through the 3c ceremony on the
-- chairman's word (decision status as of authoring: "pending"; authoring is not applying).
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated rather than database/migrations/: this file creates/replaces a TRIGGER --
--   lands in scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2).
--
-- ============================================================================
-- WHY THIS FILE, WHY NOW. NEVER an in-place edit of the applied 20260907 file.
--
-- 20260907_feedback_immutability_trigger.sql (applied 2026-09-08 10:10Z) made feedback_no_update
-- reject EVERY UPDATE unconditionally, on the premise "feedback's normal lifecycle is
-- INSERT-then-read; the census found no application UPDATE/DELETE call site outside ad-hoc
-- .artifacts/* one-off scripts". That premise was FALSIFIED: SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001's
-- 7 children (A-G) enumerate 41 live .from('feedback').update() call sites across the app/server/
-- scripts tree writing LIFECYCLE columns (status, resolution tracking, triage, assignment,
-- promotion, dedup counters, etc.) -- all of them have thrown since 09-08, and all 7 children are
-- parked pending this exact ruling (chairman_decisions ba4055b7).
--
-- The parent orchestrator's (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001) own exit test reads literally:
-- "an update to a chairman-originated feedback row fails under the service role." This migration
-- deliberately RE-SCOPES that sentence to CONTENT columns specifically -- the ratified purpose
-- (chairman-originated content survives, a correction is always a NEW row) is preserved in full;
-- only the word "any" becomes "any content". Considered and rejected (per the decision packet):
-- (b) redesign the 23+ readers around a supersedes-row chain -- does not generalize, since those
-- readers filter on the ORIGINAL row's status and would see it frozen at "new"/"open" forever
-- (Alpha-3, child F, signal a22cb042); (c) freeze only chairman-originated ROWS -- leaves every
-- machine-written content field mutable, which is the exact immutability gap the 09-07 audit was
-- for.
--
-- MECHANISM: drop+recreate ONLY the feedback_no_update TRIGGER with a WHEN clause naming every
-- CONTENT column; feedback_freeze() (the function it calls) is untouched -- same unconditional
-- RAISE EXCEPTION body as before. When the WHEN clause evaluates false (no content column
-- changed), Postgres never invokes the function at all, so a lifecycle-only UPDATE proceeds
-- exactly as if no trigger existed. feedback_no_delete_trg and feedback_no_truncate_trg are NOT
-- touched -- DELETE and TRUNCATE remain unconditionally rejected; a content correction is still
-- always a new row, never an edit or a delete-and-reinsert.
--
-- CONTENT-COLUMN CENSUS (this migration's real evidentiary basis, not a guess from column names
-- alone): every column below was checked against database/schema-reference-snapshot.json's
-- feedback entry (confirmed to exist) and cross-referenced against an exhaustive repo-wide grep of
-- every .from('feedback').update(...) call site (committed code only) to confirm NO live call site
-- writes it. Columns a real call site DOES write are the LIFECYCLE set and are deliberately absent
-- from the WHEN clause below (so changing them alone never trips the guard):
--   status, resolved_at, resolution_notes, resolution_sd_id, resolution_type, quick_fix_id,
--   session_id, metadata, updated_at, archived_at, cluster_processed_at, strategic_directive_id,
--   occurrence_count, last_seen, snoozed_until, duplicate_of_id, promoted_to_sd_id, promoted_at,
--   promoted_by, assigned_to, priority, ai_triage_suggestion, ai_triage_confidence,
--   ai_triage_classification, ai_triage_source, triaged_at, triaged_by.
--
-- TWO FINDINGS FROM THIS CENSUS, DELIBERATELY NOT FIXED HERE (separate QFs filed, out of scope):
--   (1) lib/quality/burst-detector.js:258-267 mutates `title` (content) on every burst-group
--       occurrence -- genuinely content, correctly STILL REJECTED by this migration; both its
--       callers already fail-soft (try/catch, console.log only), so burst/dedup clustering has
--       been silently broken since 09-08, independent of this fix (QF-20260912-316).
--   (2) 3 call sites (lib/quality/triage-engine.js:184-189 and :401-406, lib/quality/
--       ignore-patterns.js:239-244) write assigned_at/assignment_reason/priority_reasoning/
--       burst_group_id/ignored_by_pattern_id/ignore_reason -- columns that DO NOT EXIST on
--       public.feedback today (confirmed via live select(*), the schema snapshot, and a grep of
--       all 22 feedback-touching migrations). These fail at the DB layer regardless of any
--       trigger and are unrelated schema/code drift (QF-20260912-253).
--
-- CAVEAT, STATED RATHER THAN HIDDEN: a WHEN clause is a static, compile-time list. A future column
-- added to `feedback` that is genuinely content (e.g. a new diagnostic field) is NOT automatically
-- protected -- it defaults to lifecycle-permissive (the WHEN clause simply never references it)
-- until someone adds it here. Symmetrically, a future genuinely-lifecycle column is NOT
-- automatically exempt -- it defaults to frozen (content-protective) until removed from nowhere,
-- since it is simply absent from the WHEN clause either way. This migration follows the chairman
-- decision's literal instruction (enumerate content, guard on content-change) rather than the
-- inverse (enumerate lifecycle, guard on everything-else); either choice carries this same
-- structural caveat for genuinely novel future columns.
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS feedback_no_update ON public.feedback;
CREATE TRIGGER feedback_no_update
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  WHEN (
    OLD.title                IS DISTINCT FROM NEW.title
    OR OLD.description       IS DISTINCT FROM NEW.description
    OR OLD.category          IS DISTINCT FROM NEW.category
    OR OLD.type              IS DISTINCT FROM NEW.type
    OR OLD.feedback_type     IS DISTINCT FROM NEW.feedback_type
    OR OLD.original_type     IS DISTINCT FROM NEW.original_type
    OR OLD.source_application IS DISTINCT FROM NEW.source_application
    OR OLD.source_type       IS DISTINCT FROM NEW.source_type
    OR OLD.source_id         IS DISTINCT FROM NEW.source_id
    OR OLD.provenance_source IS DISTINCT FROM NEW.provenance_source
    OR OLD.command           IS DISTINCT FROM NEW.command
    OR OLD.environment       IS DISTINCT FROM NEW.environment
    OR OLD.page_url          IS DISTINCT FROM NEW.page_url
    OR OLD.use_case          IS DISTINCT FROM NEW.use_case
    OR OLD.error_message     IS DISTINCT FROM NEW.error_message
    OR OLD.stack_trace       IS DISTINCT FROM NEW.stack_trace
    OR OLD.error_hash        IS DISTINCT FROM NEW.error_hash
    OR OLD.user_id           IS DISTINCT FROM NEW.user_id
    OR OLD.venture_id        IS DISTINCT FROM NEW.venture_id
    OR OLD.created_at        IS DISTINCT FROM NEW.created_at
    OR OLD.first_seen        IS DISTINCT FROM NEW.first_seen
    OR OLD.sentry_issue_id   IS DISTINCT FROM NEW.sentry_issue_id
    OR OLD.sentry_first_seen IS DISTINCT FROM NEW.sentry_first_seen
    OR OLD.severity          IS DISTINCT FROM NEW.severity
    OR OLD.effort_estimate   IS DISTINCT FROM NEW.effort_estimate
    OR OLD.value_estimate    IS DISTINCT FROM NEW.value_estimate
    OR OLD.votes             IS DISTINCT FROM NEW.votes
    OR OLD.converted_at      IS DISTINCT FROM NEW.converted_at
    OR OLD.conversion_reason IS DISTINCT FROM NEW.conversion_reason
    OR OLD.ignore_pattern    IS DISTINCT FROM NEW.ignore_pattern
    OR OLD.rubric_score      IS DISTINCT FROM NEW.rubric_score
    OR OLD.quality_assessment IS DISTINCT FROM NEW.quality_assessment
    OR OLD.auto_correction_status IS DISTINCT FROM NEW.auto_correction_status
    OR OLD.corrective_class  IS DISTINCT FROM NEW.corrective_class
    OR OLD.source_gate       IS DISTINCT FROM NEW.source_gate
    OR OLD.gate_run_id       IS DISTINCT FROM NEW.gate_run_id
    OR OLD.sd_id             IS DISTINCT FROM NEW.sd_id
  )
  EXECUTE FUNCTION public.feedback_freeze();

-- feedback_freeze() itself is untouched (same function, same unconditional-raise body as
-- 20260907's) -- only the WHEN clause above, evaluated by Postgres before the function is ever
-- invoked, changes which UPDATEs reach it.

-- SECURITY: DROP+CREATE TRIGGER resets enable mode to default (ORIGIN), silently losing the
-- 20260907 migration's ENABLE ALWAYS (mirrors chairman_ratifications SEC finding M1 -- a
-- replica-mode session via SET LOCAL session_replication_role='replica' would otherwise bypass
-- this guard). Re-assert it explicitly; feedback_no_delete_trg/feedback_no_truncate_trg are not
-- touched by this migration and keep their existing ENABLE ALWAYS unchanged.
ALTER TABLE public.feedback ENABLE ALWAYS TRIGGER feedback_no_update;

COMMENT ON TABLE public.feedback IS
  'As of SD-LEO-INFRA-FEEDBACK-LIFECYCLE-UPDATE-ALLOWLIST-001: feedback_no_update now guards '
  'CONTENT columns only (see this file''s header for the full list and the lifecycle-column '
  'census) -- a lifecycle-only UPDATE (status, resolution tracking, triage, assignment, '
  'promotion, dedup counters, etc.) is unconditionally allowed. A CONTENT correction is still '
  'always a NEW row, never an edit. DELETE and TRUNCATE remain unconditionally rejected '
  '(feedback_no_delete_trg / feedback_no_truncate_trg, unchanged by this migration).';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof per the chairman decision's own acceptance criterion: "verify block
-- proves content UPDATE rejected AND status UPDATE accepted." Same deliberate-abort probe pattern
-- as the 20260907 file (never touches real production rows; the probe row is discarded via a
-- custom-SQLSTATE nested-block abort, never a real DELETE, since DELETE is still unconditionally
-- rejected).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  probe_id uuid;
BEGIN
  ASSERT to_regclass('public.feedback') IS NOT NULL, 'feedback table does not exist';

  BEGIN
    INSERT INTO public.feedback (type, source_application, source_type, title)
    VALUES ('issue', 'terminal:probe-verify', 'manual_feedback',
            'probe: SD-LEO-INFRA-FEEDBACK-LIFECYCLE-UPDATE-ALLOWLIST-001 verify')
    RETURNING id INTO probe_id;

    IF NOT EXISTS (SELECT 1 FROM public.feedback WHERE id = probe_id) THEN
      RAISE EXCEPTION 'feedback: probe INSERT did not land -- cannot verify the allowlist';
    END IF;

    -- A CONTENT UPDATE must still be rejected.
    BEGIN
      UPDATE public.feedback SET title = 'tampered-content' WHERE id = probe_id;
      RAISE EXCEPTION 'feedback: GUARD DID NOT FIRE -- a content (title) UPDATE was ACCEPTED.' USING ERRCODE = 'P0101';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected (the trigger's own P0001 rejection)
    END;

    -- A LIFECYCLE-ONLY UPDATE must be accepted (the allowlist's entire reason to exist).
    UPDATE public.feedback SET status = 'triaged', resolution_notes = 'probe: lifecycle update accepted' WHERE id = probe_id;
    IF NOT EXISTS (SELECT 1 FROM public.feedback WHERE id = probe_id AND status = 'triaged') THEN
      RAISE EXCEPTION 'feedback: LIFECYCLE UPDATE WAS REJECTED -- the allowlist is not doing its job.';
    END IF;

    -- A combined UPDATE touching BOTH a lifecycle column and a content column must still be
    -- rejected -- the guard looks at every changed column, not merely "the first one named".
    BEGIN
      UPDATE public.feedback SET status = 'resolved', description = 'tampered-content' WHERE id = probe_id;
      RAISE EXCEPTION 'feedback: GUARD DID NOT FIRE -- a mixed lifecycle+content UPDATE was ACCEPTED.' USING ERRCODE = 'P0103';
    EXCEPTION
      WHEN raise_exception THEN NULL; -- expected
    END;

    -- Deliberate cleanup abort -- discards the probe row (still append-only for DELETE, so the
    -- whole nested block is rolled back instead of a real DELETE).
    RAISE EXCEPTION 'internal: discard verify-block probe row (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN NULL; -- expected, deliberate cleanup -- probe row is now gone
  END;

  RAISE NOTICE 'feedback verified: content UPDATE rejected, lifecycle UPDATE accepted, mixed UPDATE rejected';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260912_feedback_no_update_lifecycle_allowlist_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it replaces a trigger):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (run after apply):
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.feedback'::regclass
--     AND tgname = 'feedback_no_update'; -- expect 1 row, tgenabled = 'O' (normal, has a WHEN clause)
--   -- A lifecycle-only UPDATE (e.g. `UPDATE feedback SET status = status`) on any real row should
--   -- now succeed; a content UPDATE should still raise.
-- ============================================================================
