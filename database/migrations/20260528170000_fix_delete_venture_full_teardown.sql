-- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 / hotfix 2 (feedback 881cf53f)
-- Make delete_venture (and the chairman Delete button) work for ANY venture, not just
-- the simplest ones. The full FK map into ventures revealed three classes of blocker
-- that the RPC never handled:
--
--   1. security_audit_events (+ 13 monthly partitions): an ON DELETE SET NULL FK into an
--      APPEND-ONLY table. Deleting a venture auto-UPDATEs its audit rows -> the
--      immutability trigger raises 42501. An immutable audit log must not SET NULL on
--      delete; drop the FK so audit history survives venture deletion with venture_id
--      intact (forensically correct; standard audit-log pattern).
--   2. 20 ON DELETE NO ACTION child tables (operational/telemetry/health/etc.) that block
--      the delete because the RPC never removed their rows. These are venture-owned;
--      delete them as part of teardown.
--   3. eva_vision_documents is ON DELETE CASCADE, but its children
--      (eva_vision_scores/eva_vision_iterations/eva_architecture_plans by id,
--      strategic_roadmaps/strategic_themes by vision_key) are ON DELETE RESTRICT/NO ACTION,
--      blocking the cascade. Clear them before the venture delete.
--
-- Surgical approach: keep every other FK's semantics; add explicit ordered teardown in the
-- RPC + drop only the audit FK. Verified triggers-ON (no replica) against all live ventures.

-- ── Blocker 1: drop the append-only audit log's venture FK (cascades to partitions) ──
ALTER TABLE public.security_audit_events DROP CONSTRAINT IF EXISTS fk_sae_venture_id;

-- ── Blockers 2 + 3: comprehensive teardown inside delete_venture ──
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

  -- RESTRICT children (must be deleted explicitly) ------------------------------------
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

  -- NO ACTION children (block the delete unless removed first) -------------------------
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

  -- Vision artifacts: eva_vision_documents.venture_id is ON DELETE CASCADE, but its
  -- children are RESTRICT/NO ACTION. Clear them (and the docs) before the venture delete.
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

  -- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001: cancel NON-TERMINAL linked SDs BEFORE the
  -- venture_id=NULL orphaning, so deletion leaves a cancellation audit trail.
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
