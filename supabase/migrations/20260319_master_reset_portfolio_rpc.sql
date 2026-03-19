-- Master Reset Portfolio RPC
-- SECURITY DEFINER bypasses RLS so the app client can delete all venture data.
-- Follows FK registry teardown order: RESTRICT → SET_NULL → CASCADE → ventures.

CREATE OR REPLACE FUNCTION public.master_reset_portfolio()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  venture_ids uuid[];
  deleted_count int;
BEGIN
  -- Collect all venture IDs
  SELECT array_agg(id) INTO venture_ids FROM ventures;

  IF venture_ids IS NULL OR array_length(venture_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'count', 0, 'message', 'No ventures to delete');
  END IF;

  deleted_count := array_length(venture_ids, 1);

  -- Phase 1: RESTRICT tables (governance — must delete explicitly before ventures)
  DELETE FROM chairman_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM chairman_directives WHERE venture_id = ANY(venture_ids);
  DELETE FROM governance_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM compliance_gate_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_escalation_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_gate_passage_log WHERE venture_id = ANY(venture_ids);

  -- Phase 2: SET_NULL tables (cross-references — null the FK, preserve records)
  UPDATE strategic_directives_v2 SET venture_id = NULL WHERE venture_id = ANY(venture_ids);
  UPDATE sd_phase_handoffs SET venture_id = NULL WHERE venture_id = ANY(venture_ids);
  UPDATE sd_proposals SET venture_id = NULL WHERE venture_id = ANY(venture_ids);
  UPDATE product_requirements_v2 SET venture_id = NULL WHERE venture_id = ANY(venture_ids);
  UPDATE venture_dependencies SET dependent_venture_id = NULL WHERE dependent_venture_id = ANY(venture_ids);
  UPDATE venture_dependencies SET provider_venture_id = NULL WHERE provider_venture_id = ANY(venture_ids);
  UPDATE venture_capabilities SET origin_venture_id = NULL WHERE origin_venture_id = ANY(venture_ids);
  UPDATE venture_templates SET source_venture_id = NULL WHERE source_venture_id = ANY(venture_ids);
  UPDATE venture_nursery SET promoted_to_venture_id = NULL WHERE promoted_to_venture_id = ANY(venture_ids);
  UPDATE agent_registry SET venture_id = NULL WHERE venture_id = ANY(venture_ids);

  -- Phase 3: Null self-referencing FKs on ventures table
  UPDATE ventures SET
    brief_id = NULL,
    vision_id = NULL,
    architecture_plan_id = NULL,
    ceo_agent_id = NULL,
    portfolio_id = NULL,
    company_id = NULL,
    source_blueprint_id = NULL
  WHERE id = ANY(venture_ids);

  -- Phase 4: CASCADE tables (child data — explicit delete for tables without ON DELETE CASCADE)
  DELETE FROM eva_actions WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_architecture_plans WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_interactions WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_orchestration_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_saga_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_stage_gate_results WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_trace_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_vision_documents WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_ventures WHERE venture_id = ANY(venture_ids);
  DELETE FROM chairman_approval_requests WHERE venture_id = ANY(venture_ids);
  DELETE FROM chairman_settings WHERE venture_id = ANY(venture_ids);
  DELETE FROM capital_transactions WHERE venture_id = ANY(venture_ids);
  DELETE FROM financial_models WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_attribution WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_campaigns WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_channels WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_content WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_content_queue WHERE venture_id = ANY(venture_ids);
  DELETE FROM channel_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM distribution_history WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_recalibration_forms WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage13_valuations WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage13_substage_states WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage13_assessments WHERE venture_id = ANY(venture_ids);
  DELETE FROM substage_transition_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage_zero_requests WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_stage_transitions WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_stage_work WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_documents WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance_artifacts WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance_progress WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_exit_profiles WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_financial_contract WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_phase_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_token_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_tool_quotas WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_artifacts WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_asset_registry WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_briefs WHERE venture_id = ANY(venture_ids);
  DELETE FROM agent_memory_stores WHERE venture_id = ANY(venture_ids);
  DELETE FROM intelligence_analysis WHERE venture_id = ANY(venture_ids);
  DELETE FROM competitors WHERE venture_id = ANY(venture_ids);
  DELETE FROM daily_rollups WHERE venture_id = ANY(venture_ids);
  DELETE FROM missions WHERE venture_id = ANY(venture_ids);
  DELETE FROM modeling_requests WHERE venture_id = ANY(venture_ids);
  DELETE FROM monthly_ceo_reports WHERE venture_id = ANY(venture_ids);
  DELETE FROM naming_suggestions WHERE venture_id = ANY(venture_ids);
  DELETE FROM naming_favorites WHERE venture_id = ANY(venture_ids);
  DELETE FROM orchestration_metrics WHERE venture_id = ANY(venture_ids);
  DELETE FROM pending_ceo_handoffs WHERE venture_id = ANY(venture_ids);
  DELETE FROM public_portfolio WHERE venture_id = ANY(venture_ids);
  DELETE FROM tool_usage_ledger WHERE venture_id = ANY(venture_ids);
  DELETE FROM service_tasks WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_service_bindings WHERE venture_id = ANY(venture_ids);
  DELETE FROM service_telemetry WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_exit_readiness WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_tiers WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage_proving_journal WHERE venture_id = ANY(venture_ids);
  DELETE FROM workflow_executions WHERE venture_id = ANY(venture_ids);

  -- Phase 5: Delete ventures themselves
  DELETE FROM ventures WHERE id = ANY(venture_ids);

  -- Phase 6: Clear orphaned stage_zero_requests (no venture_id FK)
  DELETE FROM stage_zero_requests WHERE venture_id IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'count', deleted_count,
    'message', deleted_count || ' venture(s) and all related data deleted'
  );
END;
$$;

-- Grant execute to authenticated users (the app client)
GRANT EXECUTE ON FUNCTION public.master_reset_portfolio() TO authenticated;
