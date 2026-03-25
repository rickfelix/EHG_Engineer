-- Migration: export_blueprint_review EVA extension
-- Date: 2026-03-25
-- SD: SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-D
-- Purpose: Add EVA governance summaries to export_blueprint_review result.
--          New function export_blueprint_review_with_eva() wraps existing RPC
--          and appends EVA vision scores, architecture plan references,
--          and SD traceability data for the chairman batch review UX.
--
-- This does NOT modify the existing export_blueprint_review() function.
-- Instead, it creates a companion function that enriches the output.

CREATE OR REPLACE FUNCTION export_blueprint_review_with_eva(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_result JSONB;
  eva_section JSONB;
  v_vision_docs JSONB;
  v_arch_plans JSONB;
  v_sd_chain JSONB;
  v_heal_scores JSONB;
BEGIN
  -- 1. Get base blueprint review data (delegates to existing v3 RPC)
  base_result := export_blueprint_review(p_venture_id);

  -- 2. Collect EVA vision documents for this venture
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'vision_key', vd.vision_key,
      'level', vd.level,
      'version', vd.version,
      'status', vd.status,
      'chairman_approved', vd.chairman_approved,
      'chairman_approved_at', vd.chairman_approved_at,
      'dimension_count', COALESCE(jsonb_array_length(vd.extracted_dimensions), 0),
      'created_at', vd.created_at
    ) ORDER BY vd.level, vd.version DESC
  ), '[]'::jsonb)
  INTO v_vision_docs
  FROM eva_vision_documents vd
  WHERE vd.venture_id = p_venture_id;

  -- 3. Collect EVA architecture plans for this venture
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'plan_key', ap.plan_key,
      'version', ap.version,
      'status', ap.status,
      'chairman_approved', ap.chairman_approved,
      'chairman_approved_at', ap.chairman_approved_at,
      'dimension_count', COALESCE(jsonb_array_length(ap.extracted_dimensions), 0),
      'created_at', ap.created_at
    ) ORDER BY ap.version DESC
  ), '[]'::jsonb)
  INTO v_arch_plans
  FROM eva_architecture_plans ap
  WHERE ap.venture_id = p_venture_id;

  -- 4. Collect SD traceability chain (SDs linked to this venture via metadata)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'sd_key', sd.sd_key,
      'title', sd.title,
      'status', sd.status,
      'sd_type', sd.sd_type,
      'current_phase', sd.current_phase,
      'progress', sd.progress,
      'vision_key', sd.metadata->>'vision_key',
      'plan_key', sd.metadata->>'plan_key',
      'parent_sd_id', sd.parent_sd_id
    ) ORDER BY sd.sequence_rank NULLS LAST
  ), '[]'::jsonb)
  INTO v_sd_chain
  FROM strategic_directives_v2 sd
  WHERE sd.venture_id = p_venture_id
    AND sd.is_active = true;

  -- 5. Collect HEAL vision scores for this venture's vision docs
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', vs.id,
      'sd_id', vs.sd_id,
      'total_score', vs.total_score,
      'threshold_action', vs.threshold_action,
      'scored_at', vs.scored_at,
      'iteration', vs.iteration
    ) ORDER BY vs.scored_at DESC
  ), '[]'::jsonb)
  INTO v_heal_scores
  FROM eva_vision_scores vs
  WHERE vs.vision_id IN (
    SELECT vd.id FROM eva_vision_documents vd WHERE vd.venture_id = p_venture_id
  );

  -- 6. Build EVA governance section
  eva_section := jsonb_build_object(
    'vision_documents', v_vision_docs,
    'architecture_plans', v_arch_plans,
    'sd_traceability', v_sd_chain,
    'heal_scores', v_heal_scores,
    'summary', jsonb_build_object(
      'vision_count', jsonb_array_length(v_vision_docs),
      'arch_plan_count', jsonb_array_length(v_arch_plans),
      'sd_count', jsonb_array_length(v_sd_chain),
      'heal_score_count', jsonb_array_length(v_heal_scores),
      'has_eva_governance', (jsonb_array_length(v_vision_docs) > 0 OR jsonb_array_length(v_arch_plans) > 0)
    )
  );

  -- 7. Merge EVA section into base result
  RETURN base_result || jsonb_build_object('eva_governance', eva_section);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION export_blueprint_review_with_eva(UUID) TO service_role;
