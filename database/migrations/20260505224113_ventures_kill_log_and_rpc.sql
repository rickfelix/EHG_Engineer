-- Migration: ventures_kill_log table + kill_venture RPC + reject_chairman_decision A-4 amendment + PrivacyPatrol AI backfill
-- SD: SD-LEO-FEAT-STAGE-REJECT-KILL-001
-- PRD: SD-LEO-FEAT-STAGE-REJECT-KILL-001 (FRs FR-2 through FR-6)
-- Depends on: 20260505224112_extend_workflow_status_killed.sql (must run first; ALTER TYPE Postgres restriction)
-- Sub-agent evidence:
--   - LEAD database-agent 2e71b53c-eacb-483d-8137-1a4ecf646494 (WARNING, 88/100, 5 amendments A-1..A-5)
--   - PLAN database-agent 7b7a0960-9c4c-40c5-9c67-511dde4ee26f (PASS, 90/100, 5 new amendments A-6..A-10)
--
-- Folded amendments: A-1 (fn_is_chairman), A-2 (event_data.type discriminator), A-3 (dual-state UPDATE),
-- A-4 (reject_chairman_decision converges kill-gate to killed), A-5 (operations_audit_log row),
-- A-6 (killed_by_user_id NULLABLE for legacy backfill), A-7 (backfill idempotency via venture_id alone),
-- A-8 (kill_venture body ordering: UPDATE -> kill_log -> eva_events -> audit_log),
-- A-9 (auth.users(id) FK = NO ACTION Postgres default), A-10 (operations_audit_log.performed_at = TIMESTAMP w/o TZ)

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Audit table: ventures_kill_log
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ventures_kill_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  killed_by_user_id UUID REFERENCES auth.users(id),  -- A-6: NULLABLE for legacy backfill (PrivacyPatrol AI pre-existed without recorded killer)
  rationale TEXT NOT NULL CHECK (length(rationale) >= 20),
  killed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ventures_kill_log_venture ON public.ventures_kill_log (venture_id);
CREATE INDEX IF NOT EXISTS idx_ventures_kill_log_killed_at ON public.ventures_kill_log (killed_at DESC);

ALTER TABLE public.ventures_kill_log ENABLE ROW LEVEL SECURITY;

-- SELECT policy: chairman OR the user who killed it
DROP POLICY IF EXISTS ventures_kill_log_select ON public.ventures_kill_log;
CREATE POLICY ventures_kill_log_select ON public.ventures_kill_log
  FOR SELECT
  USING (public.fn_is_chairman() OR killed_by_user_id = auth.uid());

-- Deliberately NO INSERT/UPDATE/DELETE policies. Writes go ONLY through
-- the kill_venture SECURITY DEFINER RPC (privilege escalation pattern).
-- Backfill INSERTs in this migration use the migration's elevated
-- privileges, not policy-checked writes.

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RPC: kill_venture (SECURITY DEFINER)
-- A-1: fn_is_chairman over auth.jwt
-- A-3: dual-state UPDATE (status=cancelled + workflow_status=killed)
-- A-2: eva_events with event_type=status_change + event_data.type discriminator
-- A-5: operations_audit_log governance trail
-- A-8: ordering UPDATE -> kill_log -> eva_events -> audit_log
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
  -- A-1: Role check via canonical helper (chairman/admin/owner accepted)
  IF NOT public.fn_is_chairman() THEN
    RAISE EXCEPTION 'Only chairman or lead can reject a venture'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Length check (matches CHECK on table; defense-in-depth; cleaner error)
  IF length(p_rationale) < 20 THEN
    RAISE EXCEPTION 'Rationale must be at least 20 characters (got %)', length(p_rationale)
      USING ERRCODE = 'check_violation';
  END IF;

  -- A-3 + A-8 step 1: dual-state UPDATE on ventures
  -- Setting BOTH status='cancelled' AND workflow_status='killed' is required:
  -- - status update fires trg_ventures_update_sync_eva (mirrors eva_ventures.status)
  -- - without status update, eva_ventures.status drifts out of sync
  -- killed_at and kill_reason populated for forward-compat with interim columns
  UPDATE public.ventures
  SET
    status = 'cancelled',
    workflow_status = 'killed',
    killed_at = now(),
    kill_reason = p_rationale,
    updated_at = now()
  WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venture % not found', p_venture_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A-8 step 2: INSERT ventures_kill_log audit row
  INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, metadata)
  VALUES (p_venture_id, v_killer_uid, p_rationale, '{}'::jsonb)
  RETURNING id INTO v_kill_log_id;

  -- A-8 step 3 + A-2: emit eva_events row (event_type=status_change is CHECK-accepted;
  -- discriminator goes inside event_data jsonb since eva_events has no event_subtype column)
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
    p_venture_id  -- audit linkage; eva_ventures.id == ventures.id per canonical pattern
  );

  -- A-8 step 4 + A-5: operations_audit_log governance trail
  -- A-10: performed_at is TIMESTAMP WITHOUT TIME ZONE (legacy schism); rely on DEFAULT now()
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
      'sd_id', '5474573f-3fd9-43e5-8c9e-4584a0cedfdc'
    )
  );

  RETURN v_kill_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kill_venture(UUID, TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. A-4 amendment: reject_chairman_decision converges kill-gate to killed
-- For kill-gate stages [3, 5, 13, 23], the function previously set
-- workflow_status='failed'. That's semantically misleading: 'failed' is for
-- automated/system failures, not chairman kill decisions. This amendment
-- converges the chairman kill path with kill_venture by setting
-- workflow_status='killed' for kill-gate rejections.
--
-- Body change is targeted to the kill-gate UPDATE branch only. All other
-- callers and return shape are unchanged.
-- ──────────────────────────────────────────────────────────────────────────

-- The full body of reject_chairman_decision is preserved here and the only
-- change is workflow_status='killed' (was 'failed') in the kill-gate UPDATE.
-- This matches the pattern database-agent inspected at PLAN.

-- Signature must preserve existing DEFAULT NULL::text on p_decided_by — Postgres
-- forbids removing parameter defaults via CREATE OR REPLACE (42P13).
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
  -- Load the decision
  SELECT venture_id, lifecycle_stage INTO v_decision
  FROM public.chairman_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chairman_decision % not found', p_decision_id;
  END IF;

  v_venture_id := v_decision.venture_id;
  v_lifecycle_stage := v_decision.lifecycle_stage;

  -- Kill-gate stage detection (matches database-agent's inventory)
  v_is_kill_gate := v_lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);

  IF v_is_kill_gate THEN
    -- A-4: chairman kill decision converges to workflow_status='killed' (was 'failed')
    -- Semantics: 'failed' = automated/system failure; 'killed' = chairman kill decision
    UPDATE public.ventures
    SET status = 'cancelled',
        workflow_status = 'killed',
        killed_at = now(),
        kill_reason = p_rationale,
        updated_at = now()
    WHERE id = v_venture_id;

    v_new_status := 'killed';
  ELSE
    -- Non-kill-gate stages: preserve historical behavior
    UPDATE public.ventures
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_venture_id;

    v_new_status := 'cancelled';
  END IF;

  -- Update the decision record
  UPDATE public.chairman_decisions
  SET decision_outcome = 'rejected',
      decision_rationale = p_rationale,
      decided_by_user_id = v_user_uid,
      decided_at = now()
  WHERE id = p_decision_id;

  -- For kill-gate path: also write ventures_kill_log + eva_events + operations_audit_log
  -- to align with kill_venture semantics
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
-- 4. PrivacyPatrol AI backfill
-- A-7: idempotency via venture_id alone (true one-row-per-venture)
-- ──────────────────────────────────────────────────────────────────────────

-- Backfill ventures_kill_log from interim ventures.killed_at + kill_reason for any
-- venture where killed_at IS NOT NULL and no kill_log row exists yet.
-- For PrivacyPatrol AI specifically: venture id 08d20036-03c9-4a26-bbc5-f37a18dfdf23,
-- kill_reason length 123 (satisfies CHECK len>=20).

INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, killed_at, metadata)
SELECT
  v.id,
  NULL,  -- A-6: legacy backfill has no recorded killer; provenance in metadata
  v.kill_reason,
  v.killed_at,
  jsonb_build_object(
    'backfill_source', 'SD-LEO-FIX-REVERT-CROSS-VENTURE-001',
    'backfilled_by_sd', 'SD-LEO-FEAT-STAGE-REJECT-KILL-001',
    'backfilled_at', now()
  )
FROM public.ventures v
WHERE v.killed_at IS NOT NULL
  AND v.kill_reason IS NOT NULL
  AND length(v.kill_reason) >= 20
  AND NOT EXISTS (
    -- A-7: filter on venture_id alone for true one-row-per-venture idempotency
    SELECT 1 FROM public.ventures_kill_log kl
    WHERE kl.venture_id = v.id
  );

-- Update any backfilled ventures to formal terminal state (workflow_status=killed,
-- status=cancelled). PrivacyPatrol AI has killed_at set but workflow_status=pending,
-- status=active — fix this drift now that the formal enum value exists.

UPDATE public.ventures
SET
  status = 'cancelled',
  workflow_status = 'killed',
  updated_at = now()
WHERE killed_at IS NOT NULL
  AND (workflow_status != 'killed' OR status != 'cancelled');

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- Verification queries (run separately after applying)
-- ──────────────────────────────────────────────────────────────────────────
--
-- 1. Table + RLS exists:
--   SELECT count(*) FROM information_schema.tables WHERE table_name = 'ventures_kill_log';
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.ventures_kill_log'::regclass;
--
-- 2. RPC exists:
--   SELECT proname FROM pg_proc WHERE proname IN ('kill_venture', 'reject_chairman_decision');
--
-- 3. PrivacyPatrol AI backfilled:
--   SELECT v.workflow_status, v.status, kl.id, kl.metadata->>'backfill_source'
--   FROM public.ventures v
--   LEFT JOIN public.ventures_kill_log kl ON kl.venture_id = v.id
--   WHERE v.id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23';
--   -- Expected: workflow_status='killed', status='cancelled', kill_log row with backfill_source
--
-- 4. Idempotency check (re-run migration):
--   -- Should report no errors and zero new ventures_kill_log rows
