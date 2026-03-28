-- Migration: Add venture_artifact_summaries and venture_sd_artifact_mapping
-- to master_reset_portfolio() function.
--
-- These two new tables must be deleted BEFORE venture_artifacts to avoid
-- FK / orphan-row issues during a full portfolio reset.
--
-- Rollback: Re-deploy the previous version of master_reset_portfolio()
-- from 20260326_patch_master_reset_portfolio.sql

CREATE OR REPLACE FUNCTION public.master_reset_portfolio()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  venture_ids UUID[];
  deleted_count INTEGER;
  caller_role TEXT;
  caller_uid UUID;
BEGIN
  caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  caller_uid  := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::UUID;
  IF caller_role IS DISTINCT FROM 'service_role'
     AND NOT fn_is_chairman() THEN
    RAISE EXCEPTION 'master_reset_portfolio: unauthorized (role=%, uid=%)', caller_role, caller_uid;
  END IF;
  SELECT ARRAY_AGG(id) INTO venture_ids FROM ventures;
  deleted_count := COALESCE(array_length(venture_ids, 1), 0);
  IF deleted_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0, 'message', 'No ventures to delete');
  END IF;
  INSERT INTO operations_audit_log (entity_type, action, performed_by, severity, metadata)
  VALUES (
    'portfolio',
    'master_reset_portfolio',
    caller_uid,
    'critical',
    jsonb_build_object(
      'venture_count', deleted_count,
      'venture_ids', to_jsonb(venture_ids),
      'caller_role', COALESCE(caller_role, 'unknown'),
      'result', 'executing',
      'timestamp', NOW()
    )
  );
  -- Phase 1: SET bypass
  SET LOCAL leo.bypass_working_on_check = 'true';
  -- Phase 2: Governance tables
  DELETE FROM chairman_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM chairman_directives WHERE venture_id = ANY(venture_ids);
  DELETE FROM governance_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM compliance_gate_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_escalation_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_gate_passage_log WHERE venture_id = ANY(venture_ids);
  -- Phase 3: NULL out FK references
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
  UPDATE ventures SET
    brief_id = NULL,
    vision_id = NULL,
    architecture_plan_id = NULL,
    ceo_agent_id = NULL,
    portfolio_id = NULL,
    company_id = NULL,
    source_blueprint_id = NULL
  WHERE id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (EVA subsystem)
  DELETE FROM eva_vision_scores WHERE vision_id IN (
    SELECT id FROM eva_vision_documents WHERE venture_id = ANY(venture_ids)
  );
  DELETE FROM eva_scheduler_metrics WHERE venture_id IN (
    SELECT venture_id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  DELETE FROM eva_scheduler_queue WHERE venture_id IN (
    SELECT venture_id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  DELETE FROM eva_audit_log WHERE eva_venture_id IN (
    SELECT id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  DELETE FROM venture_separability_scores WHERE venture_id IN (
    SELECT venture_id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  DELETE FROM eva_actions WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_architecture_plans WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_interactions WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_orchestration_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_saga_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_stage_gate_results WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_trace_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_vision_documents WHERE venture_id = ANY(venture_ids);
  DELETE FROM eva_ventures WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Chairman/Financial)
  DELETE FROM chairman_approval_requests WHERE venture_id = ANY(venture_ids);
  DELETE FROM chairman_settings WHERE venture_id = ANY(venture_ids);
  DELETE FROM capital_transactions WHERE venture_id = ANY(venture_ids);
  DELETE FROM financial_models WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_financial_contract WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_phase_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_token_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_token_ledger WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Marketing)
  DELETE FROM marketing_attribution WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_campaigns WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_channels WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_content WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_content_queue WHERE venture_id = ANY(venture_ids);
  DELETE FROM channel_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM distribution_history WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Stage/Execution)
  DELETE FROM stage_executions WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_recalibration_forms WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage13_valuations WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage13_substage_states WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage13_assessments WHERE venture_id = ANY(venture_ids);
  DELETE FROM substage_transition_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage_zero_requests WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_stage_transitions WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_stage_work WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM stage_proving_journal WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Documents/Compliance)
  DELETE FROM venture_documents WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance_artifacts WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance_progress WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_exit_profiles WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Artifacts/Enrichment) -- NEW: 2026-03-28
  DELETE FROM venture_artifact_summaries WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_sd_artifact_mapping WHERE venture_type IN (
    SELECT DISTINCT archetype FROM ventures WHERE id = ANY(venture_ids) AND archetype IS NOT NULL
  );
  DELETE FROM venture_artifacts WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Core venture data)
  DELETE FROM venture_asset_registry WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_briefs WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_exit_readiness WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_tiers WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_fundamentals WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_provisioning_state WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (SRIP/Brand)
  DELETE FROM srip_brand_interviews WHERE venture_id = ANY(venture_ids);
  DELETE FROM srip_site_dna WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Agent/Intelligence)
  DELETE FROM agent_memory_stores WHERE venture_id = ANY(venture_ids);
  DELETE FROM intelligence_analysis WHERE venture_id = ANY(venture_ids);
  DELETE FROM competitors WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Operational)
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
  DELETE FROM venture_tool_quotas WHERE venture_id = ANY(venture_ids);
  -- Phase 4: CASCADE tables (Services/Workflows)
  DELETE FROM service_tasks WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_service_bindings WHERE venture_id = ANY(venture_ids);
  DELETE FROM service_telemetry WHERE venture_id = ANY(venture_ids);
  DELETE FROM workflow_executions WHERE venture_id = ANY(venture_ids);
  -- Phase 5: Delete ventures themselves
  DELETE FROM ventures WHERE id = ANY(venture_ids);
  DELETE FROM stage_zero_requests WHERE venture_id IS NULL;
  RETURN jsonb_build_object(
    'success', true,
    'count', deleted_count,
    'message', deleted_count || ' venture(s) and all related data deleted'
  );
END;
$function$;
