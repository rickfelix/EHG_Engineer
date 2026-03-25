-- Migration: Fix retrospective trigger jsonb_array_length guards
-- Date: 2026-03-25
-- Problem: auto_validate_retrospective_quality and validate_protocol_improvements_for_process_category
--          call jsonb_array_length() without checking jsonb_typeof() = 'array' first.
--          When a column contains a scalar or object, this fails with:
--          "cannot get array length of a scalar"
-- Fix: Add jsonb_typeof(value) = 'array' guards before every jsonb_array_length() call,
--      and before every FOR loop that iterates over array elements.
--
-- Rollback: Re-deploy the previous versions of these functions (see bottom of file).

BEGIN;

-- ============================================================================
-- 1. Fix auto_validate_retrospective_quality
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_validate_retrospective_quality()
RETURNS TRIGGER AS $$
DECLARE
  validation_result JSONB;
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
  should_recalculate BOOLEAN := FALSE;
  arr_len INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_recalculate := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.what_went_well IS DISTINCT FROM NEW.what_went_well) OR
       (OLD.key_learnings IS DISTINCT FROM NEW.key_learnings) OR
       (OLD.action_items IS DISTINCT FROM NEW.action_items) OR
       (OLD.what_needs_improvement IS DISTINCT FROM NEW.what_needs_improvement) THEN
      should_recalculate := TRUE;
    END IF;
  END IF;

  IF NOT should_recalculate THEN
    RETURN NEW;
  END IF;

  -- ==========================================================================
  -- what_went_well scoring
  -- ==========================================================================
  IF NEW.what_went_well IS NOT NULL AND jsonb_typeof(NEW.what_went_well) = 'array' THEN
    arr_len := jsonb_array_length(NEW.what_went_well);
    IF arr_len >= 5 THEN
      score := score + 20;
    ELSIF arr_len < 3 THEN
      issues := issues || jsonb_build_object(
        'field', 'what_went_well',
        'issue', 'Too few items (need at least 5 for full credit, minimum 3)',
        'current_count', arr_len
      );
    ELSE
      score := score + 10;
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'what_went_well',
      'issue', 'Too few items (need at least 5 for full credit, minimum 3)',
      'current_count', 0
    );
  END IF;

  -- Generic phrase check for what_went_well
  IF NEW.what_went_well IS NOT NULL AND jsonb_typeof(NEW.what_went_well) = 'array' THEN
    FOR i IN 0..jsonb_array_length(NEW.what_went_well) - 1 LOOP
      item := NEW.what_went_well->>i;
      IF item IS NOT NULL THEN
        FOREACH phrase IN ARRAY generic_phrases LOOP
          IF item ILIKE '%' || phrase || '%' THEN
            score := score - 5;
            issues := issues || jsonb_build_object(
              'field', 'what_went_well',
              'issue', format('Generic statement detected: "%s"', phrase),
              'item', item
            );
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- key_learnings scoring
  -- ==========================================================================
  IF NEW.key_learnings IS NOT NULL AND jsonb_typeof(NEW.key_learnings) = 'array' THEN
    arr_len := jsonb_array_length(NEW.key_learnings);
    IF arr_len >= 5 THEN
      score := score + 30;
    ELSIF arr_len >= 3 THEN
      score := score + 20;
    ELSE
      issues := issues || jsonb_build_object(
        'field', 'key_learnings',
        'issue', 'Too few learnings (need at least 5 for full credit, minimum 3)',
        'current_count', arr_len
      );
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'key_learnings',
      'issue', 'Too few learnings (need at least 5 for full credit, minimum 3)',
      'current_count', 0
    );
  END IF;

  -- Vague learning check for key_learnings
  IF NEW.key_learnings IS NOT NULL AND jsonb_typeof(NEW.key_learnings) = 'array' THEN
    FOR i IN 0..jsonb_array_length(NEW.key_learnings) - 1 LOOP
      item := NEW.key_learnings->>i;
      IF item IS NOT NULL AND length(item) < 20 THEN
        issues := issues || jsonb_build_object(
          'field', 'key_learnings',
          'issue', 'Learning too vague/short (should be >20 chars with specific details)',
          'item', item
        );
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- action_items scoring
  -- ==========================================================================
  IF NEW.action_items IS NOT NULL AND jsonb_typeof(NEW.action_items) = 'array' THEN
    arr_len := jsonb_array_length(NEW.action_items);
    IF arr_len >= 3 THEN
      score := score + 20;
    ELSIF arr_len < 2 THEN
      issues := issues || jsonb_build_object(
        'field', 'action_items',
        'issue', 'Too few action items (need at least 3)',
        'current_count', arr_len
      );
    ELSE
      score := score + 10;
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'action_items',
      'issue', 'Too few action items (need at least 3)',
      'current_count', 0
    );
  END IF;

  -- ==========================================================================
  -- what_needs_improvement scoring
  -- ==========================================================================
  IF NEW.what_needs_improvement IS NOT NULL AND jsonb_typeof(NEW.what_needs_improvement) = 'array' THEN
    arr_len := jsonb_array_length(NEW.what_needs_improvement);
    IF arr_len >= 3 THEN
      score := score + 20;
    ELSIF arr_len >= 1 THEN
      score := score + 10;
    ELSE
      issues := issues || jsonb_build_object(
        'field', 'what_needs_improvement',
        'issue', 'No improvement areas identified (every SD has room for improvement)',
        'current_count', 0
      );
    END IF;
  ELSE
    -- NULL or not an array
    issues := issues || jsonb_build_object(
      'field', 'what_needs_improvement',
      'issue', 'No improvement areas identified (every SD has room for improvement)',
      'current_count', 0
    );
  END IF;

  -- Dismissive statement check for what_needs_improvement
  IF NEW.what_needs_improvement IS NOT NULL AND jsonb_typeof(NEW.what_needs_improvement) = 'array' THEN
    FOR i IN 0..jsonb_array_length(NEW.what_needs_improvement) - 1 LOOP
      item := NEW.what_needs_improvement->>i;
      IF item IS NOT NULL AND (item ILIKE '%no significant%' OR item ILIKE '%nothing%') THEN
        score := score - 10;
        issues := issues || jsonb_build_object(
          'field', 'what_needs_improvement',
          'issue', 'Dismissive statement detected - be constructive about improvements',
          'item', item
        );
      END IF;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- Specificity bonus (references to quantitative data)
  -- ==========================================================================
  IF (NEW.what_went_well::text || NEW.key_learnings::text || NEW.what_needs_improvement::text)
     ~ '\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)' THEN
    score := score + 10;
  END IF;

  score := LEAST(score, 100);
  score := GREATEST(score, 0);

  NEW.quality_score := score;
  NEW.quality_issues := issues;
  NEW.quality_validated_at := NOW();
  NEW.quality_validated_by := 'SYSTEM';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Fix validate_protocol_improvements_for_process_category
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_protocol_improvements_for_process_category()
RETURNS TRIGGER AS $$
BEGIN
  -- If learning_category is PROCESS_IMPROVEMENT, warn if protocol_improvements is empty
  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    IF NEW.protocol_improvements IS NULL
       OR jsonb_typeof(NEW.protocol_improvements) != 'array'
       OR jsonb_array_length(NEW.protocol_improvements) = 0 THEN
      -- Add a quality issue instead of blocking
      NEW.quality_issues = COALESCE(NEW.quality_issues, '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object(
          'type', 'missing_protocol_improvements',
          'severity', 'warning',
          'message', 'PROCESS_IMPROVEMENT retrospective should include protocol_improvements suggestions',
          'detected_at', now()
        ));

      -- Reduce quality score by 10 points for missing protocol improvements
      IF NEW.quality_score IS NOT NULL AND NEW.quality_score > 10 THEN
        NEW.quality_score = NEW.quality_score - 10;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- ROLLBACK SQL (manual - paste into psql if needed)
-- ============================================================================
-- To rollback, re-deploy the previous function definitions from git history.
-- The previous versions can be found by running:
--   git log --all -p -- 'database/migrations/*retrospective*'
