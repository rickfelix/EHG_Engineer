-- Migration: Patch master_reset_portfolio() with missing FK-chain tables
-- SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001 (audit gap fix)
-- Created: 2026-03-26
-- Purpose: Add 12 tables discovered during manual portfolio reset that cause FK violations.
--   The existing RPC (20260320) missed these tables, causing cascading FK failures.
--   Tables added: eva_vision_scores, stage_executions, eva_scheduler_metrics,
--   eva_scheduler_queue, eva_audit_log, venture_separability_scores, venture_token_ledger,
--   venture_fundamentals, venture_compliance, venture_provisioning_state,
--   srip_brand_interviews, srip_site_dna
-- Fix: fn_is_chairman() takes no args (reads auth.uid() internally).

CREATE OR REPLACE FUNCTION public.master_reset_portfolio()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  venture_ids UUID[];
  deleted_count INTEGER;
  caller_role TEXT;
  caller_uid UUID;
BEGIN
  -- Authorization check
  caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  caller_uid  := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::UUID;

  IF caller_role IS DISTINCT FROM 'service_role'
     AND NOT fn_is_chairman() THEN
    RAISE EXCEPTION 'master_reset_portfolio: unauthorized (role=%, uid=%)', caller_role, caller_uid;
  END IF;

  -- Collect all venture IDs
  SELECT ARRAY_AGG(id) INTO venture_ids FROM ventures;
  deleted_count := COALESCE(array_length(venture_ids, 1), 0);

  IF deleted_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0, 'message', 'No ventures to delete');
  END IF;

  -- Audit trail BEFORE deletion
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

  -- Bypass LEO triggers
  SET LOCAL leo.bypass_working_on_check = 'true';

  -- ========================================================================
  -- PHASE 1: RESTRICT tables (governance — must delete explicitly before ventures)
  -- ========================================================================
  DELETE FROM chairman_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM chairman_directives WHERE venture_id = ANY(venture_ids);
  DELETE FROM governance_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM compliance_gate_events WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_escalation_log WHERE venture_id = ANY(venture_ids);
  DELETE FROM risk_gate_passage_log WHERE venture_id = ANY(venture_ids);

  -- ========================================================================
  -- PHASE 2: SET_NULL tables (cross-references — null the FK, preserve records)
  -- ========================================================================
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

  -- ========================================================================
  -- PHASE 3: Null self-referencing FKs on ventures table
  -- ========================================================================
  UPDATE ventures SET
    brief_id = NULL,
    vision_id = NULL,
    architecture_plan_id = NULL,
    ceo_agent_id = NULL,
    portfolio_id = NULL,
    company_id = NULL,
    source_blueprint_id = NULL
  WHERE id = ANY(venture_ids);

  -- ========================================================================
  -- PHASE 3.5: Deep FK chains — delete child-of-child tables BEFORE their parents
  -- (Discovered 2026-03-26 during manual portfolio reset)
  -- ========================================================================
  -- eva_vision_scores → eva_vision_documents (must delete before vision docs)
  DELETE FROM eva_vision_scores WHERE vision_id IN (
    SELECT id FROM eva_vision_documents WHERE venture_id = ANY(venture_ids)
  );
  -- eva_scheduler_metrics → eva_ventures (must delete before eva_ventures)
  DELETE FROM eva_scheduler_metrics WHERE venture_id IN (
    SELECT venture_id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  -- eva_scheduler_queue → eva_ventures
  DELETE FROM eva_scheduler_queue WHERE venture_id IN (
    SELECT venture_id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  -- eva_audit_log → eva_ventures (uses eva_venture_id, not venture_id)
  DELETE FROM eva_audit_log WHERE eva_venture_id IN (
    SELECT id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );
  -- venture_separability_scores → eva_ventures
  DELETE FROM venture_separability_scores WHERE venture_id IN (
    SELECT venture_id FROM eva_ventures WHERE venture_id = ANY(venture_ids)
  );

  -- ========================================================================
  -- PHASE 4: CASCADE tables (child data — explicit delete)
  -- ========================================================================
  -- EVA data
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
  -- Financial
  DELETE FROM capital_transactions WHERE venture_id = ANY(venture_ids);
  DELETE FROM financial_models WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_financial_contract WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_phase_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_token_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_token_ledger WHERE venture_id = ANY(venture_ids);
  -- Marketing
  DELETE FROM marketing_attribution WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_campaigns WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_channels WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_content WHERE venture_id = ANY(venture_ids);
  DELETE FROM marketing_content_queue WHERE venture_id = ANY(venture_ids);
  DELETE FROM channel_budgets WHERE venture_id = ANY(venture_ids);
  DELETE FROM distribution_history WHERE venture_id = ANY(venture_ids);
  -- Stage & execution
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
  -- Artifacts & documents
  DELETE FROM venture_documents WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_decisions WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance_artifacts WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance_progress WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_exit_profiles WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_artifacts WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_asset_registry WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_briefs WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_exit_readiness WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_tiers WHERE venture_id = ANY(venture_ids);
  -- Venture fundamentals & compliance (added 2026-03-26)
  DELETE FROM venture_fundamentals WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_compliance WHERE venture_id = ANY(venture_ids);
  -- Provisioning state (added 2026-03-26 — new table from Bridge SD)
  DELETE FROM venture_provisioning_state WHERE venture_id = ANY(venture_ids);
  -- SRIP data (added 2026-03-26)
  DELETE FROM srip_brand_interviews WHERE venture_id = ANY(venture_ids);
  DELETE FROM srip_site_dna WHERE venture_id = ANY(venture_ids);
  -- Support
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
  DELETE FROM venture_tool_quotas WHERE venture_id = ANY(venture_ids);
  DELETE FROM service_tasks WHERE venture_id = ANY(venture_ids);
  DELETE FROM venture_service_bindings WHERE venture_id = ANY(venture_ids);
  DELETE FROM service_telemetry WHERE venture_id = ANY(venture_ids);
  DELETE FROM workflow_executions WHERE venture_id = ANY(venture_ids);

  -- ========================================================================
  -- PHASE 5: Delete ventures themselves
  -- ========================================================================
  DELETE FROM ventures WHERE id = ANY(venture_ids);

  -- ========================================================================
  -- PHASE 6: Clear orphaned stage_zero_requests (no venture_id FK)
  -- ========================================================================
  DELETE FROM stage_zero_requests WHERE venture_id IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'count', deleted_count,
    'message', deleted_count || ' venture(s) and all related data deleted'
  );
END;
$$;

-- Maintain grants
REVOKE ALL ON FUNCTION public.master_reset_portfolio() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_reset_portfolio() FROM anon;
GRANT EXECUTE ON FUNCTION public.master_reset_portfolio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_reset_portfolio() TO service_role;

COMMENT ON FUNCTION public.master_reset_portfolio() IS
  'Deletes ALL ventures and related data across 70+ tables with deep FK chain handling. '
  'SECURITY: Requires service_role or chairman privileges. '
  'Writes audit trail to operations_audit_log before deletion. '
  'Patched 2026-03-26: Added 12 missing tables from deep FK chains (eva_vision_scores, '
  'stage_executions, eva_scheduler_*, venture_token_ledger, venture_fundamentals, '
  'venture_compliance, venture_provisioning_state, srip_*). '
  'Fix: fn_is_chairman() takes no args (reads auth.uid() internally).';
