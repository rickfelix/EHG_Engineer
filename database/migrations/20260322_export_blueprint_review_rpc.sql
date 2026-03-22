-- RPC Function: export_blueprint_review
-- SD: SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
--
-- Returns a comprehensive JSONB payload with all artifacts from stages 1-16
-- for a given venture, grouped by phase with quality summaries.

CREATE OR REPLACE FUNCTION export_blueprint_review(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  phase_data JSONB := '[]'::JSONB;
  phase_record RECORD;
  stage_artifacts JSONB;
  phase_summary JSONB;
  total_artifacts INTEGER := 0;
  total_quality_sum NUMERIC := 0;
  total_quality_count INTEGER := 0;
  overall_completeness NUMERIC := 0;
  overall_quality NUMERIC := 0;
BEGIN
  -- Validate venture exists
  IF NOT EXISTS (SELECT 1 FROM ventures WHERE id = p_venture_id) THEN
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
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', va.id,
        'lifecycle_stage', va.lifecycle_stage,
        'artifact_type', va.artifact_type,
        'content', va.content,
        'quality_score', (va.metadata->>'quality_score')::numeric,
        'validation_status', va.metadata->>'validation_status',
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

  -- Build result
  result := jsonb_build_object(
    'venture_id', p_venture_id,
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

-- Grant access to service role
GRANT EXECUTE ON FUNCTION export_blueprint_review(UUID) TO service_role;

COMMENT ON FUNCTION export_blueprint_review(UUID) IS
  'Export all pre-build artifacts (stages 1-16) for a venture with quality summaries. SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001.';
