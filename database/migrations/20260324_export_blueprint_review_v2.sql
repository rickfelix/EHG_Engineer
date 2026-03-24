-- Migration: export_blueprint_review v2
-- Date: 2026-03-24
-- Purpose: Rebuild the export_blueprint_review RPC with builder-oriented grouping,
--          adding blueprint_wireframes artifact, SRIP design intelligence group,
--          and venture_name/current_stage in the response.
--
-- Changes from deployed v1:
--   1. Replaces phase-based grouping with builder-oriented groups
--   2. Adds blueprint_wireframes (S15) to "How to Build It"
--   3. Adds "Design Intelligence" group (srip_site_dna, srip_brand_interviews, design_reference_library)
--   4. Includes venture_name and current_stage in result envelope
--   5. Uses quality_score column directly (not metadata->>'quality_score')
--   6. Uses COALESCE(content, artifact_data::text) for artifact content
--
-- Rollback:
--   DROP FUNCTION IF EXISTS export_blueprint_review(UUID);
--   -- Then re-deploy the previous version from 20260322_export_blueprint_review_rpc.sql

CREATE OR REPLACE FUNCTION export_blueprint_review(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  v_venture_name TEXT;
  v_current_stage INTEGER;
  v_archetype TEXT;

  -- Builder-oriented groups
  group_what_to_build JSONB;
  group_who_its_for JSONB;
  group_how_to_build JSONB;
  group_what_it_costs JSONB;
  group_why_decisions JSONB;
  group_design_intel JSONB;

  -- SRIP data
  srip_site_dna_data JSONB;
  srip_brand_data JSONB;
  srip_design_refs JSONB;

  -- Summary counters
  total_artifacts INTEGER := 0;
  total_quality_sum NUMERIC := 0;
  total_quality_count INTEGER := 0;
  overall_quality NUMERIC := 0;
  group_count INTEGER := 5; -- base groups, incremented if design intel exists

  groups_array JSONB := '[]'::JSONB;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Validate venture exists and fetch metadata
  -- ----------------------------------------------------------------
  SELECT v.name, v.current_lifecycle_stage, v.archetype
    INTO v_venture_name, v_current_stage, v_archetype
    FROM ventures v
   WHERE v.id = p_venture_id;

  IF v_venture_name IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  -- ----------------------------------------------------------------
  -- Helper: build artifact array for a given set of artifact_types
  -- Uses COALESCE(content, artifact_data::text) for content field
  -- Uses quality_score column directly
  -- ----------------------------------------------------------------

  -- ----------------------------------------------------------------
  -- 2. "What to Build" group
  --    intake_venture_analysis (S0), truth_idea_brief (S1),
  --    identity_persona_brand (S10), blueprint_product_roadmap (S13)
  -- ----------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', va.id,
      'lifecycle_stage', va.lifecycle_stage,
      'artifact_type', va.artifact_type,
      'title', va.title,
      'content', COALESCE(va.content, va.artifact_data::text),
      'quality_score', va.quality_score,
      'validation_status', va.validation_status,
      'created_at', va.created_at
    ) ORDER BY va.lifecycle_stage, va.created_at
  ), '[]'::jsonb)
  INTO group_what_to_build
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.is_current = true
    AND va.artifact_type IN (
      'intake_venture_analysis',
      'truth_idea_brief',
      'identity_persona_brand',
      'blueprint_product_roadmap'
    );

  -- ----------------------------------------------------------------
  -- 3. "Who It's For" group
  --    truth_competitive_analysis (S4), identity_naming_visual (S11),
  --    identity_brand_guidelines (S12), identity_gtm_sales_strategy (S12)
  -- ----------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', va.id,
      'lifecycle_stage', va.lifecycle_stage,
      'artifact_type', va.artifact_type,
      'title', va.title,
      'content', COALESCE(va.content, va.artifact_data::text),
      'quality_score', va.quality_score,
      'validation_status', va.validation_status,
      'created_at', va.created_at
    ) ORDER BY va.lifecycle_stage, va.created_at
  ), '[]'::jsonb)
  INTO group_who_its_for
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.is_current = true
    AND va.artifact_type IN (
      'truth_competitive_analysis',
      'identity_naming_visual',
      'identity_brand_guidelines',
      'identity_gtm_sales_strategy'
    );

  -- ----------------------------------------------------------------
  -- 4. "How to Build It" group
  --    blueprint_technical_architecture (S14), blueprint_data_model (S14),
  --    blueprint_schema_spec (S14), blueprint_api_contract (S14),
  --    blueprint_erd_diagram (S14), blueprint_wireframes (S15) <-- NEW
  -- ----------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', va.id,
      'lifecycle_stage', va.lifecycle_stage,
      'artifact_type', va.artifact_type,
      'title', va.title,
      'content', COALESCE(va.content, va.artifact_data::text),
      'quality_score', va.quality_score,
      'validation_status', va.validation_status,
      'created_at', va.created_at
    ) ORDER BY va.lifecycle_stage, va.created_at
  ), '[]'::jsonb)
  INTO group_how_to_build
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.is_current = true
    AND va.artifact_type IN (
      'blueprint_technical_architecture',
      'blueprint_data_model',
      'blueprint_schema_spec',
      'blueprint_api_contract',
      'blueprint_erd_diagram',
      'blueprint_wireframes'
    );

  -- ----------------------------------------------------------------
  -- 5. "What It Costs" group
  --    engine_pricing_model (S7), blueprint_financial_projection (S16)
  -- ----------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', va.id,
      'lifecycle_stage', va.lifecycle_stage,
      'artifact_type', va.artifact_type,
      'title', va.title,
      'content', COALESCE(va.content, va.artifact_data::text),
      'quality_score', va.quality_score,
      'validation_status', va.validation_status,
      'created_at', va.created_at
    ) ORDER BY va.lifecycle_stage, va.created_at
  ), '[]'::jsonb)
  INTO group_what_it_costs
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.is_current = true
    AND va.artifact_type IN (
      'engine_pricing_model',
      'blueprint_financial_projection'
    );

  -- ----------------------------------------------------------------
  -- 6. "Why These Decisions" group
  --    truth_ai_critique (S2), truth_validation_decision (S3),
  --    system_devils_advocate_review (S3/S5/S13/S17),
  --    truth_financial_model (S5), engine_risk_matrix (S6),
  --    engine_business_model_canvas (S8), engine_exit_strategy (S9),
  --    blueprint_risk_register (S15)
  -- ----------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', va.id,
      'lifecycle_stage', va.lifecycle_stage,
      'artifact_type', va.artifact_type,
      'title', va.title,
      'content', COALESCE(va.content, va.artifact_data::text),
      'quality_score', va.quality_score,
      'validation_status', va.validation_status,
      'created_at', va.created_at
    ) ORDER BY va.lifecycle_stage, va.created_at
  ), '[]'::jsonb)
  INTO group_why_decisions
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.is_current = true
    AND va.artifact_type IN (
      'truth_ai_critique',
      'truth_validation_decision',
      'system_devils_advocate_review',
      'truth_financial_model',
      'engine_risk_matrix',
      'engine_business_model_canvas',
      'engine_exit_strategy',
      'blueprint_risk_register'
    );

  -- ----------------------------------------------------------------
  -- 7. "Design Intelligence" group (SRIP data -- only if exists)
  --    Sources: srip_site_dna, srip_brand_interviews, design_reference_library
  -- ----------------------------------------------------------------

  -- 7a. Site DNA records for this venture
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sd.id,
      'reference_url', sd.reference_url,
      'dna_json', sd.dna_json,
      'quality_score', sd.quality_score,
      'status', sd.status,
      'created_at', sd.created_at
    ) ORDER BY sd.created_at
  ), NULL)  -- NULL (not empty array) so we can detect absence
  INTO srip_site_dna_data
  FROM srip_site_dna sd
  WHERE sd.venture_id = p_venture_id;

  -- 7b. Brand interview records for this venture
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', bi.id,
      'site_dna_id', bi.site_dna_id,
      'answers', bi.answers,
      'pre_populated_count', bi.pre_populated_count,
      'manual_input_count', bi.manual_input_count,
      'status', bi.status,
      'created_at', bi.created_at
    ) ORDER BY bi.created_at
  ), NULL)
  INTO srip_brand_data
  FROM srip_brand_interviews bi
  WHERE bi.venture_id = p_venture_id;

  -- 7c. Design references matched by venture archetype
  --     ventures.archetype maps to design_reference_library.archetype_category
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', drl.id,
      'site_name', drl.site_name,
      'url', drl.url,
      'description', drl.description,
      'score_design', drl.score_design,
      'score_usability', drl.score_usability,
      'score_creativity', drl.score_creativity,
      'score_content', drl.score_content,
      'score_combined', drl.score_combined,
      'tech_stack', to_jsonb(drl.tech_stack),
      'agency_name', drl.agency_name,
      'country', drl.country
    ) ORDER BY drl.score_combined DESC NULLS LAST
  ), NULL)
  INTO srip_design_refs
  FROM design_reference_library drl
  WHERE drl.archetype_category = v_archetype;

  -- Build the Design Intelligence group only if any SRIP data exists
  IF srip_site_dna_data IS NOT NULL
     OR srip_brand_data IS NOT NULL
     OR srip_design_refs IS NOT NULL
  THEN
    group_design_intel := jsonb_build_object(
      'group', 'Design Intelligence',
      'group_key', 'design_intelligence',
      'description', 'SRIP-derived design tokens, brand interview insights, and curated design references',
      'site_dna', COALESCE(srip_site_dna_data, '[]'::jsonb),
      'brand_interviews', COALESCE(srip_brand_data, '[]'::jsonb),
      'design_references', COALESCE(srip_design_refs, '[]'::jsonb)
    );
    group_count := 6;
  END IF;

  -- ----------------------------------------------------------------
  -- 8. Assemble groups array with per-group quality stats
  -- ----------------------------------------------------------------

  -- Helper function inline: compute group quality avg
  -- We embed avg_quality_score and artifact_count into each group object

  groups_array := jsonb_build_array(
    jsonb_build_object(
      'group', 'What to Build',
      'group_key', 'what_to_build',
      'artifact_count', COALESCE(jsonb_array_length(group_what_to_build), 0),
      'avg_quality_score', COALESCE(
        (SELECT AVG((a->>'quality_score')::numeric)
         FROM jsonb_array_elements(group_what_to_build) a
         WHERE a->>'quality_score' IS NOT NULL), 0
      ),
      'artifacts', group_what_to_build
    ),
    jsonb_build_object(
      'group', 'Who It''s For',
      'group_key', 'who_its_for',
      'artifact_count', COALESCE(jsonb_array_length(group_who_its_for), 0),
      'avg_quality_score', COALESCE(
        (SELECT AVG((a->>'quality_score')::numeric)
         FROM jsonb_array_elements(group_who_its_for) a
         WHERE a->>'quality_score' IS NOT NULL), 0
      ),
      'artifacts', group_who_its_for
    ),
    jsonb_build_object(
      'group', 'How to Build It',
      'group_key', 'how_to_build_it',
      'artifact_count', COALESCE(jsonb_array_length(group_how_to_build), 0),
      'avg_quality_score', COALESCE(
        (SELECT AVG((a->>'quality_score')::numeric)
         FROM jsonb_array_elements(group_how_to_build) a
         WHERE a->>'quality_score' IS NOT NULL), 0
      ),
      'artifacts', group_how_to_build
    ),
    jsonb_build_object(
      'group', 'What It Costs',
      'group_key', 'what_it_costs',
      'artifact_count', COALESCE(jsonb_array_length(group_what_it_costs), 0),
      'avg_quality_score', COALESCE(
        (SELECT AVG((a->>'quality_score')::numeric)
         FROM jsonb_array_elements(group_what_it_costs) a
         WHERE a->>'quality_score' IS NOT NULL), 0
      ),
      'artifacts', group_what_it_costs
    ),
    jsonb_build_object(
      'group', 'Why These Decisions',
      'group_key', 'why_these_decisions',
      'artifact_count', COALESCE(jsonb_array_length(group_why_decisions), 0),
      'avg_quality_score', COALESCE(
        (SELECT AVG((a->>'quality_score')::numeric)
         FROM jsonb_array_elements(group_why_decisions) a
         WHERE a->>'quality_score' IS NOT NULL), 0
      ),
      'artifacts', group_why_decisions
    )
  );

  -- Append Design Intelligence group if it exists
  IF group_design_intel IS NOT NULL THEN
    groups_array := groups_array || jsonb_build_array(group_design_intel);
  END IF;

  -- ----------------------------------------------------------------
  -- 9. Compute overall summary from artifact groups
  -- ----------------------------------------------------------------
  SELECT
    COALESCE(SUM((g->>'artifact_count')::integer), 0),
    COALESCE(SUM(
      CASE WHEN (g->>'avg_quality_score')::numeric > 0
           THEN (g->>'avg_quality_score')::numeric
           ELSE 0 END
    ), 0),
    COALESCE(COUNT(*) FILTER (
      WHERE (g->>'avg_quality_score')::numeric > 0
    ), 0)
  INTO total_artifacts, total_quality_sum, total_quality_count
  FROM jsonb_array_elements(groups_array) g
  WHERE g ? 'artifact_count';  -- only artifact-bearing groups (excludes design_intel)

  IF total_quality_count > 0 THEN
    overall_quality := ROUND(total_quality_sum / total_quality_count, 1);
  END IF;

  -- ----------------------------------------------------------------
  -- 10. Build final result envelope
  -- ----------------------------------------------------------------
  result := jsonb_build_object(
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'current_stage', v_current_stage,
    'exported_at', NOW()::text,
    'groups', groups_array,
    'summary', jsonb_build_object(
      'total_artifacts', total_artifacts,
      'overall_quality_score', overall_quality,
      'group_count', group_count,
      'has_design_intelligence', (group_design_intel IS NOT NULL)
    )
  );

  RETURN result;
END;
$$;

-- Grant access to service role
GRANT EXECUTE ON FUNCTION export_blueprint_review(UUID) TO service_role;

COMMENT ON FUNCTION export_blueprint_review(UUID) IS
  'Export all pre-build artifacts for a venture grouped by builder concern (What/Who/How/Cost/Why/Design), with SRIP design intelligence. v2 2026-03-24.';
