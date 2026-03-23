-- Regroup export_blueprint_review into builder-oriented categories:
--   1. WHAT to build (product definition)
--   2. WHO it's for (market & audience)
--   3. HOW to build it (technical specs)
--   4. WHAT it costs (financial constraints)
--   5. WHY these decisions (decision context / reference)
-- Also includes stage 0 (intake) and stage 17 (DA review) artifacts.
-- Applied: 2026-03-23

CREATE OR REPLACE FUNCTION export_blueprint_review(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  v_name TEXT;
  v_stage INTEGER;
  group_data JSONB := '[]'::JSONB;
  group_record RECORD;
  group_artifacts JSONB;
  group_summary JSONB;
  total_artifacts INTEGER := 0;
  total_quality_sum NUMERIC := 0;
  total_quality_count INTEGER := 0;
  overall_quality NUMERIC := 0;
BEGIN
  -- Validate venture exists and get metadata
  SELECT name, current_lifecycle_stage INTO v_name, v_stage
  FROM ventures WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  -- Build groups by builder question
  FOR group_record IN
    SELECT
      group_key,
      group_label,
      group_description,
      artifact_types
    FROM (VALUES
      ('WHAT_TO_BUILD', 'What to Build', 'Product definition — idea, roadmap, user stories, personas',
        ARRAY['intake_venture_analysis', 'truth_idea_brief', 'identity_persona_brand',
              'blueprint_product_roadmap', 'blueprint_user_story_pack']),

      ('WHO_ITS_FOR', 'Who It''s For', 'Market & audience — competitors, customers, GTM, brand',
        ARRAY['truth_competitive_analysis', 'identity_naming_visual', 'identity_brand_guidelines',
              'identity_gtm_sales_strategy']),

      ('HOW_TO_BUILD', 'How to Build It', 'Technical specs — architecture, schema, ERD, API contracts',
        ARRAY['blueprint_technical_architecture', 'blueprint_schema_spec', 'blueprint_data_model',
              'blueprint_api_contract', 'blueprint_erd_diagram']),

      ('WHAT_IT_COSTS', 'What It Costs', 'Financial constraints — pricing, projections, runway',
        ARRAY['engine_pricing_model', 'blueprint_financial_projection']),

      ('WHY_THESE_DECISIONS', 'Why These Decisions', 'Decision context — analysis, scores, risks, reviews (reference only)',
        ARRAY['truth_ai_critique', 'truth_validation_decision', 'truth_financial_model',
              'engine_risk_matrix', 'engine_business_model_canvas', 'engine_exit_strategy',
              'blueprint_risk_register', 'blueprint_launch_readiness',
              'system_devils_advocate_review'])
    ) AS groups(group_key, group_label, group_description, artifact_types)
  LOOP
    -- Get artifacts matching this group's types
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', va.id,
        'lifecycle_stage', va.lifecycle_stage,
        'artifact_type', va.artifact_type,
        'content', COALESCE(va.content, va.artifact_data::text),
        'quality_score', va.quality_score,
        'validation_status', va.validation_status,
        'created_at', va.created_at
      ) ORDER BY va.lifecycle_stage, va.artifact_type
    ), '[]'::jsonb)
    INTO group_artifacts
    FROM venture_artifacts va
    WHERE va.venture_id = p_venture_id
      AND va.is_current = true
      AND va.lifecycle_stage <= 17
      AND va.artifact_type = ANY(group_record.artifact_types);

    -- Build group summary
    group_summary := jsonb_build_object(
      'group', group_record.group_label,
      'group_key', group_record.group_key,
      'description', group_record.group_description,
      'artifact_count', COALESCE(jsonb_array_length(group_artifacts), 0),
      'artifacts', group_artifacts
    );

    group_data := group_data || jsonb_build_array(group_summary);
    total_artifacts := total_artifacts + COALESCE(jsonb_array_length(group_artifacts), 0);

    -- Accumulate quality scores
    DECLARE
      q_sum NUMERIC;
      q_count INTEGER;
    BEGIN
      SELECT
        COALESCE(SUM((a->>'quality_score')::numeric), 0),
        COALESCE(COUNT(*) FILTER (WHERE a->>'quality_score' IS NOT NULL), 0)
      INTO q_sum, q_count
      FROM jsonb_array_elements(group_artifacts) a
      WHERE a->>'quality_score' IS NOT NULL;
      total_quality_sum := total_quality_sum + q_sum;
      total_quality_count := total_quality_count + q_count;
    END;
  END LOOP;

  -- Compute overall metrics
  IF total_quality_count > 0 THEN
    overall_quality := ROUND(total_quality_sum / total_quality_count, 1);
  END IF;

  -- Build result
  result := jsonb_build_object(
    'venture_id', p_venture_id,
    'venture_name', v_name,
    'current_stage', v_stage,
    'exported_at', NOW()::text,
    'groups', group_data,
    'summary', jsonb_build_object(
      'total_artifacts', total_artifacts,
      'overall_quality_score', overall_quality,
      'group_count', 5
    )
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION export_blueprint_review(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION export_blueprint_review(UUID) TO authenticated;

COMMENT ON FUNCTION export_blueprint_review(UUID) IS
  'Export venture artifacts grouped by builder need: What to Build, Who Its For, How to Build It, What It Costs, Why These Decisions. Includes stages 0-17.';
