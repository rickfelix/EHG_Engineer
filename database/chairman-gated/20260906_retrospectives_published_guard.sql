-- SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-1 — PUBLISHED-guard trigger on public.retrospectives
-- Target DB: EHG_Engineer
--
-- @approved-by: <PENDING -- apply via the chairman's 3-factor ceremony>
--   approval on record. See database/chairman-gated/README.md: the approver header must match
--   `git config user.email` at apply time and is checked against the chairman-approval record.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Per the SD's TR-1, ZERO live DDL apply occurs during its EXEC phase. Everything in this file was
-- proven against an EPHEMERAL vanilla PostgreSQL 16 with a hand-stubbed narrow schema
-- (tests/ddl/retrospectives-published-guard-ddl.db.test.js), never against the real table.
--
-- INCIDENT THIS CLOSES: a sub-agent holding the service-role client bypassed the JS-level
-- isSafeToWriteRetro guard and hand-wrote a raw supabase.from('retrospectives').update(...),
-- overwriting a PUBLISHED, quality_score=100 SD_COMPLETION retrospective (row ea6a6d9e, 2026-09-04
-- 16:26:03Z). The prior content survived in retrospectives_audit and was manually restored. A
-- prompt-level guard cannot bind a writer holding the service role; REVOKE cannot either (the
-- canonical writers need UPDATE on this table for their own legitimate work). A trigger with a
-- same-statement override is the only database-side shape that binds that writer today.
--
-- PROTECTED-COLUMN SCOPE (widened past the SD's own originally-named subset, per PLAN-phase
-- testing-agent review, evidence 6cf14ef0-6024-4432-ac8c-a4a2599d3dd0, against the live 83-column
-- schema): every narrative/human-authored column, INCLUDING the asymmetric siblings of the
-- originally-named set (improvement_areas alongside what_needs_improvement; related_commits/
-- related_files/affected_components alongside related_prs) and other narrative columns
-- (protocol_improvements, verbatim_citations, triangulation_divergence_insights,
-- unnecessary_work_identified, future_enhancements, coverage_analysis, bmad_insights,
-- business_value_delivered, customer_impact, performance_impact). EXPLICITLY EXCLUDED
-- (system-computed/bookkeeping, never guarded): metadata, updated_at, quality_score,
-- quality_validated_at, quality_issues, tags, learning_extracted_at. Measured live (30 days,
-- retrospectives_audit): quality_score/quality_validated_at change in 169/409 PUBLISHED
-- SD_COMPLETION updates in lockstep with the EXISTING quality-recompute trigger
-- (auto_validate_retrospective_quality), not with genuine content edits — guarding them would
-- falsely refuse roughly 40% of legitimate writes/month.
--
-- TRIGGER FIRING ORDER (Postgres fires same-timing triggers alphabetically by name): retrospectives
-- has 6 existing BEFORE INSERT-OR-UPDATE row triggers, TWO of which mutate NEW —
-- trigger_auto_populate_retrospective_fields and validate_retrospective_quality_trigger (the
-- quality-recompute). This guard is named zzz_retrospectives_published_guard specifically to sort
-- LAST among all seven, so it evaluates NEW only after every other BEFORE trigger has already
-- produced its final mutation — comparing OLD to that FINAL NEW state, per-column via
-- IS DISTINCT FROM (never a whole-row hash: tr_retrospectives_updated stamps updated_at on every
-- single write, so a hash would false-positive on every touch).
--
-- SAME-STATEMENT OVERRIDE (mirrors database/chairman-gated/20260824_strategic_directives_
-- canonical_writer_choke.sql's lifecycle_write_token / sd_canonical_writer_policy() pattern
-- exactly): retro_write_token must be set in the SAME UPDATE statement and match a registered
-- identity in retro_canonical_writer_policy(); the guard nulls it back out before RETURN so it is
-- NEVER persisted to the stored row (same NULL-at-rest discipline as the strategic_directives_v2
-- choke's zzz_ trigger).
--
-- DISTINCT SQLSTATE (RPGD1): confirmed non-colliding against the full existing custom-ERRCODE
-- inventory in this repo's other chairman-gated triggers (22004/22023/23514/28000/42501/53400/
-- EV001/P0001-2/P0100-0110/P0201-0203/SDCW1-2/SVCW1), per PLAN-phase testing-agent review.
--
-- ACTOR STAMPING (trg_retrospectives_audit): the audit trigger's changed_by column has its OWN
-- DEFAULT expression (current_setting('request.jwt.claims',true)::json->>'sub'), which measured
-- 100% NULL (1815/1815 rows, 30 days) because it never fires on the service-role/pooler write path
-- every real writer uses. This migration re-declares trg_retrospectives_audit() VERBATIM (its body
-- lives nowhere in this repo's tracked SQL and is SECURITY DEFINER, pinned by
-- database/migrations/20260602_pin_search_path_security_definer_functions.sql — the live body was
-- pulled via pg_get_functiondef('trg_retrospectives_audit'::regproc) before writing this file) with
-- ONE addition: an explicit changed_by := COALESCE(current_setting('app.retro_writer_actor', true),
-- 'uncanonical') on every INSERT into retrospectives_audit, so the fallback is produced BY the
-- trigger itself rather than relying on a default that never fires.
--
-- CEREMONY: this file lives in database/chairman-gated/ and is NEVER self-applied by the worker
-- that authors it — see that directory's README.md.
--
-- ROLLBACK: see the paired 20260906_retrospectives_published_guard_DOWN.sql (drops the new
-- trigger, restores trg_retrospectives_audit() to its exact pre-this-migration body captured
-- above, drops retro_canonical_writer_policy(), drops the retro_write_token column).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLY-TIME REQUIREMENT — lock_timeout. NOT OPTIONAL.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ADD COLUMN and CREATE TRIGGER both take an ACCESS EXCLUSIVE lock on retrospectives, which blocks
-- READS as well as writes. service_role and postgres (the roles migrations connect as) have NO
-- lock_timeout configured — a lock taken while the fleet is active would queue indefinitely behind
-- existing traffic rather than failing fast. The applying session MUST run, in the same session,
-- before any statement below:
--   SET lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. NEW COLUMN — same-statement override token, never persisted (nulled at rest by the guard)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.retrospectives
  ADD COLUMN IF NOT EXISTS retro_write_token text;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. REGISTRY — canonical writer identities allowed to override the PUBLISHED-guard
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retro_canonical_writer_policy(p_writer_identity text DEFAULT NULL)
 RETURNS TABLE(writer_identity text, notes text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH registry(writer_identity, notes) AS (
    VALUES
      ('retro_sub_agent'::text,
       'lib/sub-agents/retro/db-operations.js enhanceRetrospective() -- consults isSafeToWriteRetro before writing, threads the token through on an explicitly-authorized rewrite.'::text),
      ('handoff_retrospective_enricher',
       'scripts/modules/handoff/retrospective-enricher.js'),
      ('handoff_lead_to_plan_retrospective',
       'scripts/modules/handoff/executors/lead-to-plan/retrospective.js'),
      ('handoff_plan_to_exec_retrospective',
       'scripts/modules/handoff/executors/plan-to-exec/retrospective.js'),
      ('handoff_exec_to_plan_retrospective',
       'scripts/modules/handoff/executors/exec-to-plan/retrospective.js'),
      ('handoff_plan_to_lead_state_transitions',
       'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js'),
      ('orchestrator_completion_guardian',
       'scripts/modules/handoff/orchestrator-completion-guardian.js -- both the INSERT and UPDATE wire-in sites.'),
      ('restore_from_audit',
       'scripts/one-off/restore-retro-from-audit.mjs (SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-0) -- a documented, reviewed recovery procedure, never a raw ad-hoc write.')
  )
  SELECT writer_identity, notes FROM registry
  WHERE p_writer_identity IS NULL OR registry.writer_identity = p_writer_identity;
$function$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE GUARD — BEFORE UPDATE, fires LAST (zzz_) among retrospectives' 7 same-timing triggers
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_retrospectives_published_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_protected_changed boolean;
BEGIN
  IF OLD.retro_type = 'SD_COMPLETION' AND OLD.status = 'PUBLISHED' THEN
    v_protected_changed :=
         NEW.description                          IS DISTINCT FROM OLD.description
      OR NEW.title                                 IS DISTINCT FROM OLD.title
      OR NEW.what_went_well                        IS DISTINCT FROM OLD.what_went_well
      OR NEW.what_needs_improvement                IS DISTINCT FROM OLD.what_needs_improvement
      OR NEW.improvement_areas                     IS DISTINCT FROM OLD.improvement_areas
      OR NEW.key_learnings                         IS DISTINCT FROM OLD.key_learnings
      OR NEW.objectives_met                        IS DISTINCT FROM OLD.objectives_met
      OR NEW.action_items                          IS DISTINCT FROM OLD.action_items
      OR NEW.failure_patterns                      IS DISTINCT FROM OLD.failure_patterns
      OR NEW.success_patterns                      IS DISTINCT FROM OLD.success_patterns
      OR NEW.related_prs                           IS DISTINCT FROM OLD.related_prs
      OR NEW.related_commits                       IS DISTINCT FROM OLD.related_commits
      OR NEW.related_files                         IS DISTINCT FROM OLD.related_files
      OR NEW.affected_components                   IS DISTINCT FROM OLD.affected_components
      OR NEW.generated_by                          IS DISTINCT FROM OLD.generated_by
      OR NEW.protocol_improvements                 IS DISTINCT FROM OLD.protocol_improvements
      OR NEW.verbatim_citations                    IS DISTINCT FROM OLD.verbatim_citations
      OR NEW.triangulation_divergence_insights     IS DISTINCT FROM OLD.triangulation_divergence_insights
      OR NEW.unnecessary_work_identified           IS DISTINCT FROM OLD.unnecessary_work_identified
      OR NEW.future_enhancements                   IS DISTINCT FROM OLD.future_enhancements
      OR NEW.coverage_analysis                     IS DISTINCT FROM OLD.coverage_analysis
      OR NEW.bmad_insights                         IS DISTINCT FROM OLD.bmad_insights
      OR NEW.business_value_delivered              IS DISTINCT FROM OLD.business_value_delivered
      OR NEW.customer_impact                       IS DISTINCT FROM OLD.customer_impact
      OR NEW.performance_impact                    IS DISTINCT FROM OLD.performance_impact;

    IF v_protected_changed THEN
      IF NEW.retro_write_token IS NULL THEN
        RAISE EXCEPTION 'refusing to change PUBLISHED SD_COMPLETION retrospective % content without retro_write_token', OLD.id
          USING ERRCODE = 'RPGD1',
                HINT = 'Set retro_write_token to your registry identity in the SAME UPDATE statement. Enumerate valid identities with: SELECT writer_identity FROM public.retro_canonical_writer_policy();';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.retro_canonical_writer_policy(NEW.retro_write_token)) THEN
        RAISE EXCEPTION 'retro_write_token value % is not a registered canonical writer identity', NEW.retro_write_token
          USING ERRCODE = 'RPGD1',
                HINT = 'Enumerate valid identities with: SELECT writer_identity FROM public.retro_canonical_writer_policy();';
      END IF;
    END IF;
  END IF;

  -- NULL-at-rest: the token is a same-statement signal only, never a persisted column value.
  NEW.retro_write_token := NULL;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER zzz_retrospectives_published_guard
  BEFORE UPDATE ON public.retrospectives
  FOR EACH ROW EXECUTE FUNCTION public.enforce_retrospectives_published_guard();

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4. ACTOR STAMPING — re-declare trg_retrospectives_audit() verbatim (pulled live via
--    pg_get_functiondef before writing this file) plus the COALESCE fallback addition.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_retrospectives_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO retrospectives_audit (retrospective_id, action, new_data, changed_by)
          VALUES (NEW.id, 'INSERT', to_jsonb(NEW), COALESCE(current_setting('app.retro_writer_actor', true), 'uncanonical'));
        ELSIF TG_OP = 'UPDATE' THEN
          INSERT INTO retrospectives_audit (retrospective_id, action, old_data, new_data, changed_by)
          VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), COALESCE(current_setting('app.retro_writer_actor', true), 'uncanonical'));
        ELSIF TG_OP = 'DELETE' THEN
          INSERT INTO retrospectives_audit (retrospective_id, action, old_data, changed_by)
          VALUES (OLD.id, 'DELETE', to_jsonb(OLD), COALESCE(current_setting('app.retro_writer_actor', true), 'uncanonical'));
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $function$;
