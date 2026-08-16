-- DOWN migration for database/chairman-gated/20260816_agent_readiness_audit_schema.sql
-- SD-LEO-FEAT-AGENT-READINESS-SERVICE-001. Extracts the UP file's own inline commented ROLLBACK
-- block (lines 432-441) into an executable, staged file, so a real rollback does not depend on
-- someone hand-pasting a comment.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except to reverse a completed apply of
-- the paired UP migration above.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Purely additive UP (three new tables, one view, three functions, three triggers, RLS policies on
-- the three new tables only) — nothing existing was altered, so the reversal is a straight drop in
-- dependency order: view depends on the two audit tables; the sample table FKs to the run table
-- (ON DELETE CASCADE, so dropping run alone would take sample's rows but not its own DDL); the
-- freeze/publish-only trigger functions and canonical_model_set are dropped last since the tables
-- that reference them via trigger/CHECK must be gone first.
--
-- DATA LOSS WARNING: if the UP migration was ever applied and real audit_run/audit_sample/
-- llm_txt_version rows were written, this DOWN destroys them irrecoverably (the tables are
-- append-only/immutable BY DESIGN — that immutability protects against in-place edits, not against
-- a DROP TABLE). Confirm no measurement data needs preserving before running this in --verify mode
-- for real, not just as a rehearsal.

BEGIN;

DROP VIEW IF EXISTS public.v_agent_readiness_audit_run_integrity;

DROP TRIGGER IF EXISTS llm_txt_version_publish_only_trg ON public.llm_txt_version;
DROP TRIGGER IF EXISTS agent_readiness_audit_sample_freeze_trg ON public.agent_readiness_audit_sample;
DROP TRIGGER IF EXISTS agent_readiness_audit_run_freeze_trg ON public.agent_readiness_audit_run;

DROP TABLE IF EXISTS public.agent_readiness_audit_sample;
DROP TABLE IF EXISTS public.llm_txt_version;
DROP TABLE IF EXISTS public.agent_readiness_audit_run;

DROP FUNCTION IF EXISTS public.llm_txt_version_publish_only();
DROP FUNCTION IF EXISTS public.agent_readiness_measurement_freeze();
DROP FUNCTION IF EXISTS public.canonical_model_set(TEXT[]);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POST-ROLLBACK VERIFICATION. A DROP that silently no-ops (object never existed, wrong schema,
-- typo'd name) is indistinguishable from a real rollback unless something checks the objects are
-- actually gone.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify_down$
DECLARE
  leftover text;
BEGIN
  FOR leftover IN
    SELECT c FROM unnest(ARRAY[
      'agent_readiness_audit_run',
      'agent_readiness_audit_sample',
      'llm_txt_version'
    ]) AS c
    WHERE EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = c
    )
  LOOP
    RAISE EXCEPTION
      'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 DOWN: table % still exists after rollback', leftover;
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'v_agent_readiness_audit_run_integrity') THEN
    RAISE EXCEPTION 'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 DOWN: v_agent_readiness_audit_run_integrity still exists after rollback';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'canonical_model_set') THEN
    RAISE EXCEPTION 'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 DOWN: canonical_model_set() still exists after rollback';
  END IF;
END
$verify_down$;
