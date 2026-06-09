-- DOWN migration (reversal) for 20260608_secdef_chairman_authz_guards.sql
-- SD: SD-LEO-GEN-DEFENSE-DEPTH-ADD-001
-- Restores the exact pre-change bodies (delete_venture without the authz guard; the two
-- config setters with the prior any-authenticated auth.uid() IS NULL check).
-- WARNING: re-opens the authenticated-exposed authz hole this SD closed. Only for rollback.

-- ============================================================================
-- delete_venture(uuid) — restore (no internal guard)
-- ============================================================================
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

  DELETE FROM blueprint_quality_assessments WHERE venture_id = p_venture_id;
  DELETE FROM deep_research_results       WHERE venture_id = p_venture_id;
  DELETE FROM factory_guardrail_state     WHERE venture_id = p_venture_id;
  DELETE FROM ops_agent_health            WHERE venture_id = p_venture_id;
  DELETE FROM ops_customer_health_scores  WHERE venture_id = p_venture_id;
  DELETE FROM ops_friday_scorecards       WHERE venture_id = p_venture_id;
  DELETE FROM ops_health_alerts           WHERE venture_id = p_venture_id;
  DELETE FROM ops_product_health          WHERE venture_id = p_venture_id;
  DELETE FROM ops_quarterly_assessments   WHERE venture_id = p_venture_id;
  DELETE FROM ops_revenue_alerts          WHERE venture_id = p_venture_id;
  DELETE FROM ops_revenue_metrics         WHERE venture_id = p_venture_id;
  DELETE FROM persona_behavioral_data     WHERE venture_id = p_venture_id;
  DELETE FROM product_hunt_cache          WHERE venture_id = p_venture_id;
  DELETE FROM risk_forecasts              WHERE venture_id = p_venture_id;
  DELETE FROM service_tasks               WHERE venture_id = p_venture_id;
  DELETE FROM service_telemetry           WHERE venture_id = p_venture_id;
  DELETE FROM stage_proving_journal       WHERE venture_id = p_venture_id;
  DELETE FROM venture_artifact_summaries  WHERE venture_id = p_venture_id;
  DELETE FROM venture_exit_readiness      WHERE venture_id = p_venture_id;
  DELETE FROM venture_service_bindings    WHERE venture_id = p_venture_id;

  DELETE FROM eva_vision_scores
    WHERE vision_id IN (SELECT id FROM eva_vision_documents WHERE venture_id = p_venture_id);
  DELETE FROM eva_vision_iterations
    WHERE vision_id IN (SELECT id FROM eva_vision_documents WHERE venture_id = p_venture_id);
  DELETE FROM eva_architecture_plans
    WHERE venture_id = p_venture_id
       OR vision_id IN (SELECT id FROM eva_vision_documents WHERE venture_id = p_venture_id);
  DELETE FROM strategic_roadmaps
    WHERE vision_key IN (SELECT vision_key FROM eva_vision_documents WHERE venture_id = p_venture_id);
  DELETE FROM strategic_themes
    WHERE vision_key IN (SELECT vision_key FROM eva_vision_documents WHERE venture_id = p_venture_id);
  DELETE FROM eva_vision_documents WHERE venture_id = p_venture_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('eva_vision_documents', v_count);

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

-- ============================================================================
-- set_stage_override(int,bool,text) — restore any-authenticated check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_stage_override(p_stage_number integer, p_auto_proceed boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gate_type text;
  v_user_id uuid := auth.uid();
  v_current jsonb;
  v_updated jsonb;
  v_key text;
  v_entry jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'
      USING HINT = 'Caller must be an authenticated user.';
  END IF;

  SELECT gate_type INTO v_gate_type
  FROM public.venture_stages
  WHERE stage_number = p_stage_number;

  IF v_gate_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_STAGE_NUMBER: %', p_stage_number
      USING HINT = 'No row in venture_stages for the given stage_number.';
  END IF;

  IF p_auto_proceed = true AND v_gate_type IN ('kill', 'promotion') THEN
    RAISE EXCEPTION 'KILL_PROMOTION_NOT_OVERRIDABLE: stage % has gate_type %', p_stage_number, v_gate_type
      USING HINT = 'Kill and promotion gates require manual chairman approval and cannot be auto-advanced.';
  END IF;

  v_key := 'stage_' || p_stage_number;

  SELECT stage_overrides INTO v_current
  FROM public.chairman_dashboard_config
  WHERE config_key = 'default';

  IF v_current IS NULL THEN
    v_current := '{}'::jsonb;
  END IF;

  IF p_auto_proceed IS NULL THEN
    v_updated := v_current - v_key;
  ELSE
    v_entry := jsonb_build_object(
      'auto_proceed', p_auto_proceed,
      'reason', COALESCE(p_reason, CASE
        WHEN p_auto_proceed = true THEN 'Opted in to auto-advance by Chairman'
        ELSE 'Paused by Chairman'
      END),
      'set_by', v_user_id::text,
      'set_at', NOW()::text
    );
    v_updated := v_current || jsonb_build_object(v_key, v_entry);
  END IF;

  UPDATE public.chairman_dashboard_config
  SET stage_overrides = v_updated,
      updated_at = NOW()
  WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ROW_MISSING: chairman_dashboard_config row with config_key=default not found'
      USING HINT = 'Seed the default row before calling this function.';
  END IF;

  RETURN jsonb_build_object(
    'stage_number', p_stage_number,
    'auto_proceed', p_auto_proceed,
    'gate_type', v_gate_type,
    'set_by', v_user_id::text,
    'cleared', p_auto_proceed IS NULL
  );
END;
$function$;

-- ============================================================================
-- set_global_auto_proceed(bool) — restore any-authenticated check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_global_auto_proceed(p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'INVALID_VALUE: p_enabled must be true or false (not null)';
  END IF;

  UPDATE public.chairman_dashboard_config
  SET global_auto_proceed = p_enabled,
      updated_at = NOW()
  WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ROW_MISSING: chairman_dashboard_config row with config_key=default not found';
  END IF;

  RETURN jsonb_build_object(
    'global_auto_proceed', p_enabled,
    'set_by', v_user_id::text
  );
END;
$function$;
