-- LEO Protocol Enhancement #2: Retrospective Quality Enforcement
-- Purpose: Prevent generic retrospectives that provide no value
-- Root Cause Fixed: Generic/empty retrospectives allowed
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 retrospective

-- ============================================================================
-- SCHEMA CHANGES: Add quality tracking to retrospectives table
-- ============================================================================

ALTER TABLE retrospectives
  ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  ADD COLUMN IF NOT EXISTS quality_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_validated_by VARCHAR(100);

-- ============================================================================
-- FUNCTION: Validate Retrospective Quality
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_retrospective_quality(retro_id UUID)
RETURNS JSONB AS $$
DECLARE
  retro RECORD;
  issues JSONB := '[]'::jsonb;
  score INTEGER := 0;
  generic_phrases TEXT[] := ARRAY[
    'SD completed',
    'no issues',
    'no significant challenges',
    'LEO Protocol followed successfully',
    'went well',
    'completed at 100%',
    'no problems'
  ];
  phrase TEXT;
  item TEXT;
BEGIN
  -- Get retrospective data
  SELECT * INTO retro FROM retrospectives WHERE id = retro_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'score', 0,
      'passed', false,
      'issues', jsonb_build_array('Retrospective not found')
    );
  END IF;

  -- ============================================================================
  -- VALIDATION 1: What Went Well (20 points)
  -- ============================================================================
  IF retro.what_went_well IS NOT NULL AND array_length(retro.what_went_well, 1) >= 5 THEN
    score := score + 20;
  ELSIF retro.what_went_well IS NULL OR array_length(retro.what_went_well, 1) < 3 THEN
    issues := issues || jsonb_build_object(
      'field', 'what_went_well',
      'issue', 'Too few items (need at least 5 for full credit, minimum 3)',
      'current_count', COALESCE(array_length(retro.what_went_well, 1), 0)
    );
  ELSE
    score := score + 10; -- Partial credit for 3-4 items
  END IF;

  -- Check for generic statements (penalty)
  IF retro.what_went_well IS NOT NULL THEN
    FOREACH item IN ARRAY retro.what_went_well LOOP
      FOREACH phrase IN ARRAY generic_phrases LOOP
        IF item ILIKE '%' || phrase || '%' THEN
          score := score - 5;
          issues := issues || jsonb_build_object(
            'field', 'what_went_well',
            'issue', format('Generic statement detected: "%s"', phrase),
            'item', item
          );
          EXIT; -- One penalty per item
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- ============================================================================
  -- VALIDATION 2: Key Learnings Specificity (30 points)
  -- ============================================================================
  IF retro.key_learnings IS NOT NULL AND array_length(retro.key_learnings, 1) >= 5 THEN
    score := score + 30;
  ELSIF retro.key_learnings IS NOT NULL AND array_length(retro.key_learnings, 1) >= 3 THEN
    score := score + 20; -- Partial credit
  ELSIF retro.key_learnings IS NULL OR array_length(retro.key_learnings, 1) < 3 THEN
    issues := issues || jsonb_build_object(
      'field', 'key_learnings',
      'issue', 'Too few learnings (need at least 5 for full credit, minimum 3)',
      'current_count', COALESCE(array_length(retro.key_learnings, 1), 0)
    );
  END IF;

  -- Check for vague learnings (penalty)
  IF retro.key_learnings IS NOT NULL THEN
    FOREACH item IN ARRAY retro.key_learnings LOOP
      IF length(item) < 20 THEN -- Too short to be meaningful
        issues := issues || jsonb_build_object(
          'field', 'key_learnings',
          'issue', 'Learning too vague/short (should be >20 chars with specific details)',
          'item', item
        );
      END IF;
    END LOOP;
  END IF;

  -- ============================================================================
  -- VALIDATION 3: Action Items (20 points)
  -- ============================================================================
  IF retro.action_items IS NOT NULL AND array_length(retro.action_items, 1) >= 3 THEN
    score := score + 20;
  ELSIF retro.action_items IS NULL OR array_length(retro.action_items, 1) < 2 THEN
    issues := issues || jsonb_build_object(
      'field', 'action_items',
      'issue', 'Too few action items (need at least 3)',
      'current_count', COALESCE(array_length(retro.action_items, 1), 0)
    );
  ELSE
    score := score + 10; -- Partial credit for 2 items
  END IF;

  -- ============================================================================
  -- VALIDATION 4: Improvement Areas (20 points)
  -- ============================================================================
  IF retro.what_needs_improvement IS NOT NULL AND array_length(retro.what_needs_improvement, 1) >= 3 THEN
    score := score + 20;
  ELSIF retro.what_needs_improvement IS NOT NULL AND array_length(retro.what_needs_improvement, 1) >= 1 THEN
    score := score + 10; -- Partial credit
  ELSE
    issues := issues || jsonb_build_object(
      'field', 'what_needs_improvement',
      'issue', 'No improvement areas identified (every SD has room for improvement)',
      'current_count', 0
    );
  END IF;

  -- Check for dismissive statements
  IF retro.what_needs_improvement IS NOT NULL THEN
    FOREACH item IN ARRAY retro.what_needs_improvement LOOP
      IF item ILIKE '%no significant%' OR item ILIKE '%nothing%' THEN
        score := score - 10;
        issues := issues || jsonb_build_object(
          'field', 'what_needs_improvement',
          'issue', 'Dismissive statement detected - be constructive about improvements',
          'item', item
        );
      END IF;
    END LOOP;
  END IF;

  -- ============================================================================
  -- VALIDATION 5: Specificity Bonus (10 points)
  -- ============================================================================
  -- Award bonus if retrospective mentions specific metrics, file names, or technologies
  IF (retro.what_went_well::text || retro.key_learnings::text || retro.what_needs_improvement::text)
     ~ '\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)' THEN
    score := score + 10;
  END IF;

  -- Cap score at 100
  score := LEAST(score, 100);
  -- Floor at 0
  score := GREATEST(score, 0);

  RETURN jsonb_build_object(
    'score', score,
    'passed', score >= 70,
    'issues', issues,
    'threshold', 70,
    'recommendation', CASE
      WHEN score >= 70 THEN 'Quality meets LEO Protocol standards'
      WHEN score >= 50 THEN 'Add more specific details and concrete examples'
      ELSE 'Retrospective needs significant improvement - be specific and detailed'
    END
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-validate quality on insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_validate_retrospective_quality()
RETURNS TRIGGER AS $$
DECLARE
  validation_result JSONB;
BEGIN
  -- Run quality validation
  validation_result := validate_retrospective_quality(NEW.id);

  -- Update quality fields
  NEW.quality_score := (validation_result->>'score')::INTEGER;
  NEW.quality_issues := validation_result->'issues';
  NEW.quality_validated_at := NOW();
  NEW.quality_validated_by := 'SYSTEM';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_retrospective_quality_trigger
  BEFORE INSERT OR UPDATE OF what_went_well, what_needs_improvement, key_learnings, action_items
  ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_retrospective_quality();

-- ============================================================================
-- FUNCTION: Check if retrospective quality blocks SD completion
-- ============================================================================

CREATE OR REPLACE FUNCTION check_retrospective_quality_for_sd(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  retro RECORD;
  result JSONB;
BEGIN
  -- Get most recent retrospective for SD
  SELECT * INTO retro
  FROM retrospectives
  WHERE sd_id = sd_id_param
  ORDER BY conducted_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_retrospective', false,
      'quality_passed', false,
      'blocking', true,
      'message', 'No retrospective found - LEAD approval blocked'
    );
  END IF;

  -- Check quality score
  IF retro.quality_score IS NULL THEN
    -- Trigger validation
    PERFORM validate_retrospective_quality(retro.id);
    -- Reload
    SELECT * INTO retro FROM retrospectives WHERE id = retro.id;
  END IF;

  result := jsonb_build_object(
    'has_retrospective', true,
    'quality_score', retro.quality_score,
    'quality_passed', retro.quality_score >= 70,
    'blocking', retro.quality_score < 70,
    'issues', retro.quality_issues,
    'message', CASE
      WHEN retro.quality_score >= 70 THEN 'Retrospective quality acceptable'
      ELSE format('Retrospective quality too low (%s/100, need 70+)', retro.quality_score)
    END
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN retrospectives.quality_score IS 'Auto-calculated quality score (0-100) based on specificity, detail, and completeness';
COMMENT ON COLUMN retrospectives.quality_issues IS 'Array of quality issues found during validation';
COMMENT ON COLUMN retrospectives.auto_generated IS 'True if retrospective was auto-generated without human review';
COMMENT ON FUNCTION validate_retrospective_quality IS 'Validates retrospective quality - awards points for specificity, detail, concrete examples; penalizes generic statements';
COMMENT ON FUNCTION check_retrospective_quality_for_sd IS 'Checks if SD has acceptable retrospective quality (score ≥70) before allowing LEAD approval';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #2 applied successfully';
  RAISE NOTICE 'Columns added: quality_score, quality_issues, auto_generated';
  RAISE NOTICE 'Function created: validate_retrospective_quality(retro_id)';
  RAISE NOTICE 'Function created: check_retrospective_quality_for_sd(sd_id)';
  RAISE NOTICE 'Trigger created: auto_validate_retrospective_quality';
  RAISE NOTICE 'Quality threshold: 70/100 required for LEAD approval';
END $$;
