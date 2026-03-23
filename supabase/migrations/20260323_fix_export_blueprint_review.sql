-- Fix export_blueprint_review RPC:
-- 1. Add venture_name and current_stage to output
-- 2. Use COALESCE(content, artifact_data::text) to capture all artifact content
-- 3. Read quality_score from direct column, not metadata JSONB
-- 4. Read validation_status from direct column, not metadata JSONB
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
  phase_data JSONB := '[]'::JSONB;
  phase_record RECORD;
  stage_artifacts JSONB;
  phase_summary JSONB;
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

  -- Build per-phase summaries
  FOR phase_record IN
    SELECT
      phase_name,
      phase_label,
      stage_start,
      stage_end
    FROM (VALUES
      ('THE_TRUTH',     'The Truth',     1,  5),
      ('THE_ENGINE',    'The Engine',    6,  9),
      ('THE_IDENTITY',  'The Identity',  10, 12),
      ('THE_BLUEPRINT', 'The Blueprint', 13, 16)
    ) AS phases(phase_name, phase_label, stage_start, stage_end)
  LOOP
    -- Get artifacts for this phase
    -- Use COALESCE to pick up content from either 'content' or 'artifact_data' column
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', va.id,
        'lifecycle_stage', va.lifecycle_stage,
        'artifact_type', va.artifact_type,
        'content', COALESCE(va.content, va.artifact_data::text),
        'quality_score', va.quality_score,
        'validation_status', va.validation_status,
        'created_at', va.created_at
      ) ORDER BY va.lifecycle_stage
    ), '[]'::jsonb)
    INTO stage_artifacts
    FROM venture_artifacts va
    WHERE va.venture_id = p_venture_id
      AND va.is_current = true
      AND va.lifecycle_stage >= phase_record.stage_start
      AND va.lifecycle_stage <= phase_record.stage_end;

    -- Compute phase statistics
    SELECT
      jsonb_build_object(
        'phase', phase_record.phase_label,
        'phase_key', phase_record.phase_name,
        'stage_range', jsonb_build_array(phase_record.stage_start, phase_record.stage_end),
        'artifact_count', COALESCE(jsonb_array_length(stage_artifacts), 0),
        'avg_quality_score', COALESCE(
          (SELECT AVG((a->>'quality_score')::numeric)
           FROM jsonb_array_elements(stage_artifacts) a
           WHERE a->>'quality_score' IS NOT NULL), 0
        ),
        'artifacts', stage_artifacts
      )
    INTO phase_summary;

    phase_data := phase_data || jsonb_build_array(phase_summary);
    total_artifacts := total_artifacts + COALESCE(jsonb_array_length(stage_artifacts), 0);

    -- Accumulate quality scores
    SELECT
      COALESCE(SUM((a->>'quality_score')::numeric), 0),
      COALESCE(COUNT(*) FILTER (WHERE a->>'quality_score' IS NOT NULL), 0)
    INTO total_quality_sum, total_quality_count
    FROM jsonb_array_elements(stage_artifacts) a
    WHERE a->>'quality_score' IS NOT NULL;
  END LOOP;

  -- Compute overall metrics
  IF total_quality_count > 0 THEN
    overall_quality := ROUND(total_quality_sum / total_quality_count, 1);
  END IF;

  -- Build result with venture context
  result := jsonb_build_object(
    'venture_id', p_venture_id,
    'venture_name', v_name,
    'current_stage', v_stage,
    'exported_at', NOW()::text,
    'phases', phase_data,
    'summary', jsonb_build_object(
      'total_artifacts', total_artifacts,
      'overall_quality_score', overall_quality,
      'phase_count', 4
    )
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION export_blueprint_review(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION export_blueprint_review(UUID) TO authenticated;

COMMENT ON FUNCTION export_blueprint_review(UUID) IS
  'Export all pre-build artifacts (stages 1-16) for a venture with quality summaries. Includes venture_name and current_stage. Fixed: reads content from both content and artifact_data columns.';
