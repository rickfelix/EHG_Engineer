-- Migration: ventures.teardown_disposition columns + kill/cancel disposition-default wiring
-- SD: SD-LEO-INFRA-VENTURE-KILL-CANCEL-001
-- PRD: PRD-SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 (FR-1)
-- Depends on: 20260505224113_ventures_kill_log_and_rpc.sql (kill_venture, reject_chairman_decision)
-- Sub-agent evidence:
--   - LEAD EXPLORE 3194859e-dd64-455f-8550-05479465cb79, VALIDATION bfd1beef-366e-4918-891b-50b088ff8d93
--   - PLAN TESTING dbd754fd-8135-4fa3-9010-b3bc197767c0
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventures_teardown_disposition_check'
  ) THEN
    ALTER TABLE public.ventures
      ADD CONSTRAINT ventures_teardown_disposition_check
      CHECK (teardown_disposition IS NULL OR teardown_disposition IN ('pending_teardown', 'retained', 'torn_down'));
  END IF;
END $$;

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

GRANT EXECUTE ON FUNCTION public.kill_venture(UUID, TEXT) TO authenticated;

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

-- ──────────────────────────────────────────────────────────────────────────
-- 4. First execution against the measured backlog: MarketLens (id=ecbba50e)
--    is the only real (non-demo) Cloud Run zombie of the 2 non-demo terminal+
--    deployed ventures (CronGenius is replit.dev, AltifyAI is Cloudflare
--    Workers). Pre-fix probe: HTTP 200, confirmed live by both LEAD Explore
--    and PLAN VALIDATION passes (2026-08-23). Actual gcloud teardown
--    execution is deferred to a credentialed follow-up SD -- this records
--    the explicit, chairman-reviewable disposition only.
-- ──────────────────────────────────────────────────────────────────────────

UPDATE public.ventures
SET
  teardown_disposition = 'pending_teardown',
  teardown_disposition_reason = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001: live Cloud Run zombie, probed HTTP 200 2026-08-23 (46 days after 2026-07-08 kill). Actual gcloud teardown deferred to a credentialed follow-up SD (no GCP admin credentials exist in this repo/session).',
  teardown_disposition_by = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001',
  teardown_disposition_at = now()
WHERE id = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00'
  AND teardown_disposition IS NULL;

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
-- 2. MarketLens disposition recorded:
--   SELECT id, status, deployment_url, teardown_disposition, teardown_disposition_reason
--   FROM public.ventures WHERE id = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
--   -- Expected: teardown_disposition='pending_teardown', non-null reason
--
-- 3. Idempotency check (re-run migration): should report no errors, no column/constraint
--    duplication (IF NOT EXISTS guards), and the MarketLens UPDATE is a no-op the second
--    time (teardown_disposition IS NULL guard in the WHERE clause).
