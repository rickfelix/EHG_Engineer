-- SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001
--
-- Adds SECURITY DEFINER RPC log_stage_advance_override(p_venture_id, p_reason, p_verdict_snapshot)
-- so authenticated browsers can write Stage 20 manual-override audit rows into audit_log.
-- Direct INSERT is RLS-blocked (only service_role allowed); SECURITY DEFINER is the canonical pattern.
--
-- audit_log row shape:
--   event_type   = 'stage_advance_override' (literal)
--   entity_type  = 'venture' (literal)
--   entity_id    = p_venture_id::text
--   severity     = 'warning'
--   created_by   = auth.uid()::text
--   metadata     = {reason, verdict_snapshot, attempted_transition, stage_number, actor}
--
-- Returns the audit_log row id (uuid).
--
-- Rollback (trailing comment):
--   DROP FUNCTION IF EXISTS public.log_stage_advance_override(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.log_stage_advance_override(
  p_venture_id uuid,
  p_reason text,
  p_verdict_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_actor text;
BEGIN
  -- Defensive: require non-empty reason >=10 chars (matches client-side gate)
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason is required and must be at least 10 characters';
  END IF;

  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'p_venture_id is required';
  END IF;

  v_actor := COALESCE(auth.uid()::text, 'unknown');

  INSERT INTO public.audit_log (
    event_type,
    entity_type,
    entity_id,
    severity,
    created_by,
    metadata
  ) VALUES (
    'stage_advance_override',
    'venture',
    p_venture_id::text,
    'warning',
    v_actor,
    jsonb_build_object(
      'reason', trim(p_reason),
      'verdict_snapshot', p_verdict_snapshot,
      'attempted_transition', '20->21',
      'stage_number', 20,
      'actor', v_actor
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION public.log_stage_advance_override(uuid, text, jsonb) IS
  'SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001: writes Stage 20 manual override audit_log row. Authenticated callers must invoke this BEFORE re-attempting advance_venture_stage; audit-first ordering preserves the integrity surface even if advance subsequently fails.';

-- Authenticated users may invoke (RPC is SECURITY DEFINER and shapes the row internally)
GRANT EXECUTE ON FUNCTION public.log_stage_advance_override(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_stage_advance_override(uuid, text, jsonb) TO service_role;
