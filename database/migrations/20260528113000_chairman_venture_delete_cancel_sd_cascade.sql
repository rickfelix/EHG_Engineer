-- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 / FR-A
-- Extend kill_venture and delete_venture so cancelling OR deleting a venture also
-- cancels its NON-TERMINAL strategic directives instead of leaving them orphaned.
--
-- Today delete_venture orphans SDs (UPDATE strategic_directives_v2 SET venture_id = NULL)
-- and kill_venture ignores them entirely. After this migration, both RPCs set the
-- venture's in-flight SDs (status NOT IN completed,cancelled) to 'cancelled' with a
-- reason + metadata.cancelled_due_to_venture, inside their existing transaction.
-- completed/cancelled SDs are left untouched. Additive + idempotent (CREATE OR REPLACE;
-- the cascade UPDATE no-ops when zero non-terminal SDs are linked).

-- ── kill_venture: add SD-cancellation cascade ──────────────────────────────────
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

  -- A-8 step 3 + A-2: emit eva_events row
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
      'kill_log_id', v_kill_log_id,
      'strategic_directives_cancelled', v_sd_cancelled
    ),
    p_venture_id
  );

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

-- ── delete_venture: cancel non-terminal SDs BEFORE the existing venture_id=NULL ──
CREATE OR REPLACE FUNCTION public.delete_venture(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name TEXT;
  v_deleted_counts JSONB := '{}'::JSONB;
  v_count INT;
BEGIN
  SELECT name INTO v_name FROM ventures WHERE id = p_venture_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
  END IF;
  DELETE FROM chairman_decisions WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('chairman_decisions', v_count);
  DELETE FROM chairman_directives WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('chairman_directives', v_count);
  DELETE FROM governance_decisions WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('governance_decisions', v_count);
  DELETE FROM compliance_gate_events WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('compliance_gate_events', v_count);
  DELETE FROM risk_escalation_log WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('risk_escalation_log', v_count);
  DELETE FROM risk_gate_passage_log WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('risk_gate_passage_log', v_count);

  -- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001: cancel NON-TERMINAL linked SDs BEFORE
  -- the existing venture_id=NULL orphaning, so deletion leaves a cancellation audit
  -- trail instead of silently orphaning active SDs. completed/cancelled SDs untouched.
  UPDATE strategic_directives_v2
  SET status = 'cancelled',
      cancellation_reason = 'Cancelled by venture deletion (' || v_name || ')',
      metadata = COALESCE(metadata, '{}'::jsonb)
                 || jsonb_build_object('cancelled_due_to_venture', p_venture_id, 'cancelled_at', now()),
      updated_at = now()
  WHERE venture_id = p_venture_id
    AND status NOT IN ('completed', 'cancelled');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('strategic_directives_cancelled', v_count);

  UPDATE strategic_directives_v2 SET venture_id = NULL WHERE venture_id = p_venture_id;
  UPDATE sd_phase_handoffs SET venture_id = NULL WHERE venture_id = p_venture_id;
  UPDATE sd_proposals SET venture_id = NULL WHERE venture_id = p_venture_id;
  UPDATE product_requirements_v2 SET venture_id = NULL WHERE venture_id = p_venture_id;
  UPDATE venture_dependencies SET dependent_venture_id = NULL WHERE dependent_venture_id = p_venture_id;
  UPDATE venture_dependencies SET provider_venture_id = NULL WHERE provider_venture_id = p_venture_id;
  UPDATE venture_capabilities SET origin_venture_id = NULL WHERE origin_venture_id = p_venture_id;
  UPDATE venture_templates SET source_venture_id = NULL WHERE source_venture_id = p_venture_id;
  UPDATE venture_nursery SET promoted_to_venture_id = NULL WHERE promoted_to_venture_id = p_venture_id;
  UPDATE agent_registry SET venture_id = NULL WHERE venture_id = p_venture_id;
  UPDATE ventures SET
    brief_id = NULL,
    vision_id = NULL,
    architecture_plan_id = NULL,
    ceo_agent_id = NULL,
    portfolio_id = NULL,
    company_id = NULL,
    source_blueprint_id = NULL
  WHERE id = p_venture_id;
  DELETE FROM ventures WHERE id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture delete returned 0 rows');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_name,
    'deleted_counts', v_deleted_counts
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$function$;
