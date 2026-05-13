-- @approved-by: rickfelix@example.com
-- SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-1
-- stage_creates_decision RPC: single source of truth for the gate predicate
-- previously hardcoded in lib/eva/chairman-decision-watcher.js (const DECISION_CREATING_STAGES Set).
-- Mirrors can_auto_advance RPC (20260512_can_auto_advance_rpc.sql Part B) hardening.
--
-- Predicate (PRD-confirmed): creates_decision = (gate_type IN ('kill','promotion') OR review_mode = 'review').
-- Behavior changes vs old Set: ADDS S16 (gate_type='promotion', empirically verified),
--   REMOVES S20 (gate_type='none' empirically verified).
-- Sample for non-existent stage (e.g. p_stage_number=99): RETURNS single row with NULL gate_type,
--   NULL review_mode, creates_decision=false (matches PRD task #1).
--
-- Reviewed by DATABASE sub-agent at PLAN phase (sub_agent_execution_results id=c866978f).

CREATE OR REPLACE FUNCTION public.stage_creates_decision(p_stage_number INT)
RETURNS TABLE(creates_decision BOOLEAN, gate_type TEXT, review_mode TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gate_type TEXT;
  v_review_mode TEXT;
BEGIN
  SELECT sc.gate_type, sc.review_mode
    INTO v_gate_type, v_review_mode
    FROM public.stage_config sc
   WHERE sc.stage_number = p_stage_number
   LIMIT 1;

  IF NOT FOUND THEN
    -- Non-existent stage: single row, NULLs, creates_decision=false.
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_gate_type IN ('kill','promotion') OR v_review_mode = 'review'),
    v_gate_type,
    v_review_mode;
END;
$$;

COMMENT ON FUNCTION public.stage_creates_decision(INT) IS
  'SECURITY DEFINER. Single source of truth for the decision-creating-stage predicate. '
  'Replaces const DECISION_CREATING_STAGES Set previously in lib/eva/chairman-decision-watcher.js. '
  'Predicate: creates_decision = (gate_type IN (kill,promotion) OR review_mode = review). '
  'Non-existent stages return single row with NULL gate_type/review_mode and creates_decision=false. '
  'Mirrors can_auto_advance RPC hardening pattern. '
  'Source: SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-1 (2026-05-13).';

REVOKE EXECUTE ON FUNCTION public.stage_creates_decision(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_creates_decision(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_creates_decision(INT) TO service_role;
-- anon is implicitly denied via REVOKE FROM PUBLIC (parity with can_auto_advance).
