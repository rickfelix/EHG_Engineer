-- Migration: ventures.teardown_disposition columns + kill/cancel disposition-default wiring
-- SD: SD-LEO-INFRA-VENTURE-KILL-CANCEL-001
-- PRD: PRD-SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 (FR-1)
-- Depends on: 20260505224113_ventures_kill_log_and_rpc.sql (kill_venture, reject_chairman_decision)
-- Sub-agent evidence:
--   - LEAD EXPLORE 3194859e-dd64-455f-8550-05479465cb79, VALIDATION bfd1beef-366e-4918-891b-50b088ff8d93
--   - PLAN TESTING dbd754fd-8135-4fa3-9010-b3bc197767c0
-- @chairman-gated
--
-- ⚠ THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   This migration modifies two existing SECURITY DEFINER RPCs (CREATE OR REPLACE FUNCTION),
--   which scripts/lib/migration-tier-classifier.mjs's allow-list design intentionally does
--   NOT cover -- function bodies can contain arbitrary logic, so any CREATE/REPLACE FUNCTION
--   fails closed to TIER-2 regardless of content (confirmed live: removing the migration's
--   GRANT/UPDATE/DO statements did not change the classification -- the FUNCTION statements
--   alone are sufficient). The builder that authored this file holds none of the 3-factor
--   chairman-gate credentials and MUST NOT forge the attestation. The chairman adds the
--   `@approved-by` line and runs:
--       node scripts/apply-migration.js database/migrations/20260823145041_ventures_teardown_disposition.sql --prod-deploy
--   Observable proof of application:
--       SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'ventures' AND column_name LIKE 'teardown_disposition%';
--       -- Expected: 4 rows (previously 0).
--
-- A chairman-commissioned architecture evaluation (Solomon eval S5-1/R4) found that when a
-- venture transitions to a terminal status (cancelled/killed), its deployment is neither
-- torn down nor explicitly retained -- it keeps running silently. VALIDATION found direct,
-- automated Cloud Run teardown is not executable from this repo/session (no gcloud CLI, no
-- GCP admin credentials, and the deploy-CREATE pipeline has never run in production). This
-- migration closes the VISIBILITY half: an explicit, chairman-reviewable disposition record.
-- Actual teardown execution is deferred to a credentialed follow-up SD.
--
-- TESTING F9: TEXT + CHECK, not a native enum -- this migration family already documents an
-- ALTER-TYPE-ordering hazard (see 20260505224113's own header) for enum types.
-- TESTING F2: kill_venture()'s signature is UNCHANGED -- CREATE OR REPLACE preserves it; the
-- existing UPDATE gains a COALESCE-style "set only if currently NULL" clause so a disposition
-- set by an earlier, separate action (e.g. a pre-emptive 'retained') is never overwritten.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. New columns on ventures
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS teardown_disposition TEXT,
  ADD COLUMN IF NOT EXISTS teardown_disposition_reason TEXT,
  ADD COLUMN IF NOT EXISTS teardown_disposition_by TEXT,
  ADD COLUMN IF NOT EXISTS teardown_disposition_at TIMESTAMPTZ;

ALTER TABLE public.ventures
  ADD CONSTRAINT ventures_teardown_disposition_check
  CHECK (teardown_disposition IS NULL OR teardown_disposition IN ('pending_teardown', 'retained', 'torn_down'));

CREATE INDEX IF NOT EXISTS idx_ventures_teardown_disposition
  ON public.ventures (teardown_disposition)
  WHERE teardown_disposition IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. kill_venture(): add disposition-default clause to the existing UPDATE.
--    Signature is UNCHANGED (no new parameter) -- CREATE OR REPLACE only.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kill_venture(
  p_venture_id UUID,
  p_rationale TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_killer_uid UUID := auth.uid();
  v_kill_log_id UUID;
BEGIN
  IF NOT public.fn_is_chairman() THEN
    RAISE EXCEPTION 'Only chairman or lead can reject a venture'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(p_rationale) < 20 THEN
    RAISE EXCEPTION 'Rationale must be at least 20 characters (got %)', length(p_rationale)
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.ventures
  SET
    status = 'cancelled',
    workflow_status = 'killed',
    killed_at = now(),
    kill_reason = p_rationale,
    -- SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-1: default to pending_teardown only when no
    -- disposition is already set (e.g. a pre-emptive 'retained' recorded before this kill) --
    -- COALESCE never overwrites an existing value.
    teardown_disposition = COALESCE(
      teardown_disposition,
      CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END
    ),
    updated_at = now()
  WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venture % not found', p_venture_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, metadata)
  VALUES (p_venture_id, v_killer_uid, p_rationale, '{}'::jsonb)
  RETURNING id INTO v_kill_log_id;

  INSERT INTO public.eva_events (event_type, event_source, event_data, eva_venture_id)
  VALUES (
    'status_change',
    'kill_venture_rpc',
    jsonb_build_object(
      'type', 'venture.killed',
      'venture_id', p_venture_id,
      'killed_by_user_id', v_killer_uid,
      'rationale', p_rationale,
      'killed_at', now(),
      'kill_log_id', v_kill_log_id
    ),
    p_venture_id
  );

  INSERT INTO public.operations_audit_log (entity_type, entity_id, action, performed_by, severity, metadata)
  VALUES (
    'venture',
    p_venture_id::text,
    'kill',
    v_killer_uid,
    'warning',
    jsonb_build_object(
      'rationale', p_rationale,
      'kill_log_id', v_kill_log_id,
      'sd_id', 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001'
    )
  );

  RETURN v_kill_log_id;
END;
$$;

-- No GRANT statement here: CREATE OR REPLACE FUNCTION preserves the existing
-- GRANT EXECUTE ... TO authenticated already established by
-- 20260505224113_ventures_kill_log_and_rpc.sql:141 -- re-asserting it would be
-- both redundant and would push this migration into TIER-2 chairman-gated
-- classification (GRANT is unconditionally forbidden top-level per
-- scripts/lib/migration-tier-classifier.mjs).

-- ──────────────────────────────────────────────────────────────────────────
-- 3. reject_chairman_decision(): same disposition-default clause added to the
--    kill-gate UPDATE branch only. Signature UNCHANGED (preserves the existing
--    DEFAULT NULL::text on p_decided_by -- CREATE OR REPLACE forbids removing
--    parameter defaults, 42P13).
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_chairman_decision(
  p_decision_id UUID,
  p_rationale TEXT,
  p_decided_by TEXT DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision RECORD;
  v_venture_id UUID;
  v_lifecycle_stage INTEGER;
  v_is_kill_gate BOOLEAN;
  v_new_status TEXT;
  v_user_uid UUID := auth.uid();
BEGIN
  SELECT venture_id, lifecycle_stage INTO v_decision
  FROM public.chairman_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chairman_decision % not found', p_decision_id;
  END IF;

  v_venture_id := v_decision.venture_id;
  v_lifecycle_stage := v_decision.lifecycle_stage;

  v_is_kill_gate := v_lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);

  IF v_is_kill_gate THEN
    UPDATE public.ventures
    SET status = 'cancelled',
        workflow_status = 'killed',
        killed_at = now(),
        kill_reason = p_rationale,
        -- SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-1: same disposition-default clause as
        -- kill_venture(), kept in sync (both are terminal-status disposition writers).
        teardown_disposition = COALESCE(
          teardown_disposition,
          CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END
        ),
        updated_at = now()
    WHERE id = v_venture_id;

    v_new_status := 'killed';
  ELSE
    UPDATE public.ventures
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_venture_id;

    v_new_status := 'cancelled';
  END IF;

  UPDATE public.chairman_decisions
  SET decision_outcome = 'rejected',
      decision_rationale = p_rationale,
      decided_by_user_id = v_user_uid,
      decided_at = now()
  WHERE id = p_decision_id;

  IF v_is_kill_gate THEN
    INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, metadata)
    VALUES (
      v_venture_id,
      v_user_uid,
      p_rationale,
      jsonb_build_object('source', 'reject_chairman_decision', 'decision_id', p_decision_id)
    );

    INSERT INTO public.eva_events (event_type, event_source, event_data, eva_venture_id)
    VALUES (
      'status_change',
      'reject_chairman_decision_rpc',
      jsonb_build_object(
        'type', 'venture.killed',
        'venture_id', v_venture_id,
        'killed_by_user_id', v_user_uid,
        'rationale', p_rationale,
        'lifecycle_stage', v_lifecycle_stage,
        'decision_id', p_decision_id
      ),
      v_venture_id
    );

    INSERT INTO public.operations_audit_log (entity_type, entity_id, action, performed_by, severity, metadata)
    VALUES (
      'venture',
      v_venture_id::text,
      'kill',
      v_user_uid,
      'warning',
      jsonb_build_object(
        'rationale', p_rationale,
        'source', 'reject_chairman_decision',
        'decision_id', p_decision_id,
        'lifecycle_stage', v_lifecycle_stage
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'decision_id', p_decision_id,
    'venture_id', v_venture_id,
    'lifecycle_stage', v_lifecycle_stage,
    'new_status', v_new_status,
    'is_kill_gate', v_is_kill_gate,
    'source', 'reject_chairman_decision'
  );
END;
$$;

-- FR-3 (recording MarketLens's explicit pending_teardown disposition) is
-- DELIBERATELY NOT in this migration -- it is a live-data UPDATE on a
-- specific production row, which is unconditionally TIER-2 chairman-gated
-- per scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set,
-- regardless of how narrowly scoped the WHERE clause is. See the companion
-- migration 20260823145530_marketlens_teardown_disposition_CHAIRMAN_GATED.sql.

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- Verification queries (run separately after applying)
-- ──────────────────────────────────────────────────────────────────────────
--
-- 1. Columns + constraint exist:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ventures' AND column_name LIKE 'teardown_disposition%';
--   SELECT conname FROM pg_constraint WHERE conname = 'ventures_teardown_disposition_check';
--
-- 2. RPC signatures unchanged (no new overload):
--   SELECT proname, pronargs FROM pg_proc WHERE proname IN ('kill_venture', 'reject_chairman_decision');
--   -- Expected: kill_venture pronargs=2, reject_chairman_decision pronargs=3 (unchanged)
--
-- 3. Re-run note: ADD COLUMN uses IF NOT EXISTS (idempotent); ADD CONSTRAINT does NOT
--    (Postgres has no ADD CONSTRAINT IF NOT EXISTS) -- a second run will fail loudly on the
--    constraint with a clear "already exists" error rather than silently duplicating it.
--    This migration is intended as a one-shot apply, matching this repo's general convention.
