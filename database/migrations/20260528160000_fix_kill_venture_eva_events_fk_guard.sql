-- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 / hotfix
-- Fix: kill_venture 409 (foreign_key_violation) when cancelling a venture that has
-- no eva_ventures mirror row.
--
-- kill_venture emits an eva_events row with eva_venture_id = p_venture_id, but
-- eva_events.eva_venture_id has an FK to eva_ventures(id). Ventures created outside
-- the EVA pipeline (test/legacy rows) have no eva_ventures mirror, so that INSERT
-- threw 23503 and — because the whole RPC is one transaction — rolled back the
-- entire kill (venture left active, SDs not cancelled). Surfaced via the new
-- Chairman Cancel button (FR-C); the eva_events insert itself is pre-existing.
--
-- Fix: make the eva_events emission conditional on the mirror existing
-- (INSERT ... SELECT ... WHERE EXISTS). When there is no EVA mirror the event is
-- skipped and the kill proceeds; the audit trail is still recorded in
-- ventures_kill_log + operations_audit_log. Strictly more permissive; no behavior
-- change for ventures that DO have a mirror.

CREATE OR REPLACE FUNCTION public.kill_venture(p_venture_id uuid, p_rationale text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_killer_uid UUID := auth.uid();
  v_kill_log_id UUID;
  v_sd_cancelled INT := 0;  -- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001
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

  -- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001: cancel the venture's NON-TERMINAL
  -- strategic directives so a killed venture no longer leaves orphaned active SDs.
  UPDATE public.strategic_directives_v2
  SET
    status = 'cancelled',
    cancellation_reason = p_rationale,
    metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('cancelled_due_to_venture', p_venture_id, 'cancelled_at', now()),
    updated_at = now()
  WHERE venture_id = p_venture_id
    AND status NOT IN ('completed', 'cancelled');
  GET DIAGNOSTICS v_sd_cancelled = ROW_COUNT;

  -- A-8 step 2: INSERT ventures_kill_log audit row
  INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, metadata)
  VALUES (p_venture_id, v_killer_uid, p_rationale,
          jsonb_build_object('strategic_directives_cancelled', v_sd_cancelled))
  RETURNING id INTO v_kill_log_id;

  -- A-8 step 3 + A-2: emit eva_events row — GUARDED on the eva_ventures mirror.
  -- eva_events.eva_venture_id FKs to eva_ventures(id); ventures created outside the
  -- EVA pipeline have no mirror, so emit the event only when one exists. The kill
  -- must not be aborted just because the venture is not EVA-tracked.
  INSERT INTO public.eva_events (event_type, event_source, event_data, eva_venture_id)
  SELECT
    'status_change',
    'kill_venture_rpc',
    jsonb_build_object(
      'type', 'venture.killed',
      'venture_id', p_venture_id,
      'killed_by_user_id', v_killer_uid,
      'rationale', p_rationale,
      'killed_at', now(),
      'kill_log_id', v_kill_log_id,
      'strategic_directives_cancelled', v_sd_cancelled
    ),
    p_venture_id
  WHERE EXISTS (SELECT 1 FROM public.eva_ventures WHERE id = p_venture_id);

  -- A-8 step 4 + A-5: operations_audit_log governance trail
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
      'strategic_directives_cancelled', v_sd_cancelled,
      'sd_id', '5474573f-3fd9-43e5-8c9e-4584a0cedfdc'
    )
  );

  RETURN v_kill_log_id;
END;
$function$;
