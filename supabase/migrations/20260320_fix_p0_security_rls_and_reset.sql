-- P0 Security Hotfix: RLS Bypass + Unprotected master_reset_portfolio()
-- CISO Audit Findings, 2026-03-20
--
-- Issue 1: venture_artifacts_modify grants ALL to public with USING(true),
--          rendering all other RLS policies on this table ineffective.
-- Issue 2: master_reset_portfolio() runs as SECURITY DEFINER, deletes ALL
--          ventures across 60+ tables, and has no authorization check or
--          audit trail. Granted to authenticated role.
--
-- ROLLBACK:
--   Issue 1: CREATE POLICY venture_artifacts_modify ON venture_artifacts FOR ALL TO public USING (true);
--   Issue 2: Restore from 20260319_master_reset_portfolio_rpc.sql


-- ============================================================================
-- ISSUE 1: Drop the venture_artifacts_modify bypass policy
-- ============================================================================
-- Verified coverage before dropping:
--   venture_artifacts_select_policy  (authenticated, SELECT, fn_user_has_venture_access)
--   venture_artifacts_insert_policy  (authenticated, INSERT, fn_user_has_venture_access)
--   venture_artifacts_update_policy  (authenticated, UPDATE, fn_user_has_venture_access)
--   venture_artifacts_delete_policy  (authenticated, DELETE, fn_is_chairman)

DROP POLICY IF EXISTS venture_artifacts_modify ON venture_artifacts;


-- ============================================================================
-- ISSUE 2: Harden master_reset_portfolio() with auth check + audit trail
-- ============================================================================
-- Changes:
--   1. Authorization gate: only service_role or chairman can execute
--   2. Audit log entry written to operations_audit_log BEFORE any deletes
--   3. Revoke EXECUTE from anon and public (no anonymous portfolio resets)

CREATE OR REPLACE FUNCTION public.master_reset_portfolio()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  venture_ids uuid[];
  deleted_count int;
  caller_uid uuid;
  caller_role text;
  is_chairman boolean;
BEGIN
  -- ========================================================================
  -- AUTHORIZATION CHECK
  -- ========================================================================
  caller_role := current_setting('request.jwt.claims', true)::json->>'role';
  caller_uid  := auth.uid();

  -- Allow service_role (server-side admin calls)
  IF caller_role = 'service_role' THEN
    -- Authorized: service_role bypasses user-level checks
    NULL;
  ELSE
    -- For authenticated users, must be chairman
    is_chairman := fn_is_chairman();
    IF NOT COALESCE(is_chairman, false) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: master_reset_portfolio requires service_role or chairman privileges. caller_uid=%, role=%',
        COALESCE(caller_uid::text, 'null'), COALESCE(caller_role, 'null');
    END IF;
  END IF;

  -- ========================================================================
  -- COLLECT VENTURE IDS
  -- ========================================================================
  SELECT array_agg(id) INTO venture_ids FROM ventures;

  IF venture_ids IS NULL OR array_length(venture_ids, 1) IS NULL THEN
    -- Still log the attempt even if nothing to delete
    INSERT INTO operations_audit_log (entity_type, action, performed_by, module, severity, metadata)
    VALUES (
      'portfolio',
      'master_reset_portfolio',
      caller_uid,
      'security',
      'warning',
      jsonb_build_object(
        'venture_count', 0,
        'caller_role', COALESCE(caller_role, 'unknown'),
        'result', 'no_ventures_to_delete',
        'timestamp', NOW()
      )
    );

    RETURN jsonb_build_object('success', true, 'count', 0, 'message', 'No ventures to delete');
  END IF;

  deleted_count := array_length(venture_ids, 1);

  -- ========================================================================
  -- AUDIT LOG: Record BEFORE deletion (if delete fails, we still have the log)
  -- ========================================================================
  INSERT INTO operations_audit_log (entity_type, action, performed_by, module, severity, metadata)
  VALUES (
    'portfolio',
    'master_reset_portfolio',
    caller_uid,
    'security',
    'critical',
    jsonb_build_object(
      'venture_count', deleted_count,
      'venture_ids', to_jsonb(venture_ids),
      'caller_role', COALESCE(caller_role, 'unknown'),
      'result', 'executing',
      'timestamp', NOW()
    )
  );

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
  -- PHASE 4: CASCADE tables (child data — explicit delete for tables without ON DELETE CASCADE)
  -- ========================================================================
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

-- Tighten grants: revoke from public and anon, keep authenticated + service_role
REVOKE ALL ON FUNCTION public.master_reset_portfolio() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_reset_portfolio() FROM anon;
GRANT EXECUTE ON FUNCTION public.master_reset_portfolio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_reset_portfolio() TO service_role;

-- Add function comment for documentation
COMMENT ON FUNCTION public.master_reset_portfolio() IS
  'Deletes ALL ventures and related data across 60+ tables. '
  'SECURITY: Requires service_role or chairman privileges. '
  'Writes audit trail to operations_audit_log before deletion. '
  'Hardened 2026-03-20 per CISO audit findings.';
