-- SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 — Venture Lifecycle Soft-Deletion <-> Applications Registry Reconciliation
--
-- PROBLEM: When a venture is killed/cancelled/deleted via kill_venture()/delete_venture(),
-- the `applications` registry row is left untouched. The SUB_AGENT_REPO_RESOLUTION gate's
-- compliance view (v_sub_agent_repo_compliance) joins applications with NO status/deleted
-- filter, so a retired venture's repo still influences gate verdicts. There is also no
-- audit trail for a retired application and no way to reuse a retired name.
--
-- FIX (reversible, history-preserving — mirrors ventures.deleted_at / chairman_decisions.deleted_at):
--   FR-1  add nullable tombstone columns to applications (absence == live)
--   FR-2  swap the FULL unique name indexes for PARTIAL (WHERE deleted_at IS NULL) so a
--         retired name can be reused by a new live application
--   FR-3  an ADDITIVE trigger on ventures stamps the linked applications tombstone (and sets
--         status='inactive') on the kill/cancel transition AND before a venture row is deleted
--         (applications.venture_id is ON DELETE SET NULL, so we must stamp BEFORE the delete).
--         No existing RPC body is modified; no row is ever physically purged.
--   FR-4  the gate view v_sub_agent_repo_compliance excludes tombstoned applications
--         (behavior-preserving today: zero tombstoned rows -> filter excludes nothing).
--
-- Additive + reversible. Down-migration: database/migrations/20260530_applications_soft_delete_reconcile_down.sql
-- applications has 10 rows (8 active/2 inactive), zero duplicate names -> partial-index creation is safe.

-- ── FR-1: reversible tombstone columns ──────────────────────────────────────────
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS deleted_at      timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS deleted_by      text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS deletion_reason text;

COMMENT ON COLUMN public.applications.deleted_at IS
  'SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001: reversible tombstone. NULL == live. Set when the linked venture is retired/deleted; clearing it restores the row.';

-- ── FR-2: partial unique indexes scoped to LIVE rows (allow retired-name reuse) ──
DROP INDEX IF EXISTS public.uq_applications_name_lower;
DROP INDEX IF EXISTS public.uq_applications_normalized_name;
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_name_lower
  ON public.applications (lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_normalized_name
  ON public.applications (normalized_name) WHERE deleted_at IS NULL;

-- ── FR-3: additive tombstone trigger on ventures (no RPC bodies modified) ────────
CREATE OR REPLACE FUNCTION public.fn_tombstone_application_on_venture_retire()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor  text := COALESCE(auth.uid()::text, current_user, 'system');
  v_vid    uuid;
  v_reason text;
BEGIN
  -- DELETE fires BEFORE the row is removed (and before the ON DELETE SET NULL on
  -- applications.venture_id), so the link is still intact here.
  IF TG_OP = 'DELETE' THEN
    v_vid    := OLD.id;
    v_reason := 'venture deleted: ' || COALESCE(OLD.name, OLD.id::text);
  ELSE
    v_vid    := NEW.id;
    -- NEW.status is venture_status_enum; cast to text before COALESCE with '' (the enum
    -- has no '' label, so COALESCE(NEW.status, '') would coerce '' to the enum and throw).
    v_reason := COALESCE(NEW.kill_reason, 'venture retired (status=' || COALESCE(NEW.status::text, '') || ')');
  END IF;

  -- Idempotent: only stamps a LIVE applications row; re-firing is a no-op.
  UPDATE public.applications
  SET status          = 'inactive',
      deleted_at      = now(),
      deleted_by      = v_actor,
      deletion_reason = v_reason,
      updated_at      = now()
  WHERE venture_id = v_vid
    AND deleted_at IS NULL;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

COMMENT ON FUNCTION public.fn_tombstone_application_on_venture_retire() IS
  'SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 FR-3: stamps the linked applications tombstone (status=inactive + deleted_at/by/reason) when a venture is killed/cancelled (AFTER UPDATE) or deleted (BEFORE DELETE). Additive — does not modify kill_venture/delete_venture. No physical purge.';

DROP TRIGGER IF EXISTS trg_tombstone_application_on_venture_kill ON public.ventures;
CREATE TRIGGER trg_tombstone_application_on_venture_kill
  AFTER UPDATE ON public.ventures
  FOR EACH ROW
  WHEN (
    (NEW.status = 'cancelled'      AND OLD.status          IS DISTINCT FROM NEW.status)
    OR (NEW.workflow_status = 'killed' AND OLD.workflow_status IS DISTINCT FROM NEW.workflow_status)
  )
  EXECUTE FUNCTION public.fn_tombstone_application_on_venture_retire();

DROP TRIGGER IF EXISTS trg_tombstone_application_on_venture_delete ON public.ventures;
CREATE TRIGGER trg_tombstone_application_on_venture_delete
  BEFORE DELETE ON public.ventures
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tombstone_application_on_venture_retire();

-- ── FR-4: gate view excludes tombstoned applications (behavior-preserving today) ─
-- Exact reproduction of 20260526_capa4_sub_agent_repo_resolution.sql with the single
-- added join predicate `AND a.deleted_at IS NULL`. A retired application no longer matches
-- -> a.local_path IS NULL -> compliance_status = 'unknown_application' (correctly flagged).
CREATE OR REPLACE VIEW v_sub_agent_repo_compliance AS
SELECT
  saer.id,
  saer.created_at,
  saer.sd_id,
  sd.sd_key,
  sd.target_application,
  a.local_path AS expected_repo_path,
  saer.sub_agent_code,
  saer.phase,
  saer.metadata->>'repo_path' AS metadata_repo_path,
  (saer.metadata->>'repo_resolved')::boolean AS metadata_repo_resolved,
  saer.executed_from_cwd,
  CASE
    WHEN NOT (saer.metadata ? 'repo_path')              THEN 'legacy'
    WHEN a.local_path IS NULL                            THEN 'unknown_application'
    WHEN saer.metadata->>'repo_path' IS NULL             THEN 'explicit_null'
    WHEN saer.executed_from_cwd IS NOT NULL
         AND saer.metadata->>'repo_path' = saer.executed_from_cwd THEN 'cwd_leak'
    WHEN saer.metadata->>'repo_path' = a.local_path      THEN 'compliant'
    ELSE 'violation'
  END AS compliance_status
FROM sub_agent_execution_results saer
LEFT JOIN strategic_directives_v2 sd ON sd.id = saer.sd_id
LEFT JOIN applications a              ON a.name = sd.target_application AND a.deleted_at IS NULL;

COMMENT ON VIEW v_sub_agent_repo_compliance IS
  'SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-7b + SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 FR-4: per-row compliance classification for the PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate. The applications join now excludes tombstoned rows (deleted_at IS NULL) so a retired venture no longer influences gate verdicts; a retired target_application falls to unknown_application. Statuses: legacy, compliant, explicit_null, violation, cwd_leak, unknown_application.';

-- ── Inline self-verification (fail-fast at apply time) ───────────────────────────
DO $verify$
DECLARE
  v_cols int;
  v_partial int;
  v_trig int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='applications'
     AND column_name IN ('deleted_at','deleted_by','deletion_reason');
  IF v_cols <> 3 THEN RAISE EXCEPTION 'VERIFY FR-1: expected 3 tombstone columns, found %', v_cols; END IF;

  SELECT count(*) INTO v_partial FROM pg_indexes
   WHERE schemaname='public' AND tablename='applications'
     AND indexname IN ('uq_applications_name_lower','uq_applications_normalized_name')
     AND indexdef ILIKE '%deleted_at IS NULL%';
  IF v_partial <> 2 THEN RAISE EXCEPTION 'VERIFY FR-2: expected 2 partial unique indexes, found %', v_partial; END IF;

  SELECT count(*) INTO v_trig FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('trg_tombstone_application_on_venture_kill','trg_tombstone_application_on_venture_delete');
  IF v_trig <> 2 THEN RAISE EXCEPTION 'VERIFY FR-3: expected 2 tombstone triggers, found %', v_trig; END IF;

  RAISE NOTICE 'SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001: schema verification PASSED (3 columns, 2 partial indexes, 2 triggers).';
END;
$verify$;
