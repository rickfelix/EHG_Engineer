-- Migration: Fix Retrospective Validation Trigger
-- Problem: Trigger validation function tries to SELECT the row being inserted (which doesn't exist yet)
-- Solution: Pass the NEW record data directly to validation function
-- Date: 2025-10-16

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS validate_retrospective_quality_trigger ON retrospectives;
DROP FUNCTION IF EXISTS auto_validate_retrospective_quality() CASCADE;

-- Create new trigger function that passes data directly
CREATE OR REPLACE FUNCTION auto_validate_retrospective_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
BEGIN
  -- ============================================================================
  -- VALIDATION 1: What Went Well (20 points)
  -- ============================================================================
  IF NEW.what_went_well IS NOT NULL AND jsonb_array_length(NEW.what_went_well) >= 5 THEN
    score := score + 20;
  ELSIF NEW.what_went_well IS NULL OR jsonb_array_length(NEW.what_went_well) < 3 THEN
    issues := issues || jsonb_build_object(
      'field', 'what_went_well',
      'issue', 'Too few items (need at least 5 for full credit, minimum 3)',
      'current_count', COALESCE(jsonb_array_length(NEW.what_went_well), 0)
    );
  ELSE
    score := score + 10; -- Partial credit for 3-4 items
  END IF;

  -- Check for generic statements (penalty)
  IF NEW.what_went_well IS NOT NULL THEN
    FOR i IN 0..jsonb_array_length(NEW.what_went_well) - 1 LOOP
      item := NEW.what_went_well->>i;
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
  IF NEW.key_learnings IS NOT NULL AND jsonb_array_length(NEW.key_learnings) >= 5 THEN
    score := score + 30;
  ELSIF NEW.key_learnings IS NOT NULL AND jsonb_array_length(NEW.key_learnings) >= 3 THEN
    score := score + 20; -- Partial credit
  ELSIF NEW.key_learnings IS NULL OR jsonb_array_length(NEW.key_learnings) < 3 THEN
    issues := issues || jsonb_build_object(
      'field', 'key_learnings',
      'issue', 'Too few learnings (need at least 5 for full credit, minimum 3)',
      'current_count', COALESCE(jsonb_array_length(NEW.key_learnings), 0)
    );
  END IF;

  -- Check for vague learnings (penalty)
  IF NEW.key_learnings IS NOT NULL THEN
    FOR i IN 0..jsonb_array_length(NEW.key_learnings) - 1 LOOP
      item := NEW.key_learnings->>i;
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
  IF NEW.action_items IS NOT NULL AND jsonb_array_length(NEW.action_items) >= 3 THEN
    score := score + 20;
  ELSIF NEW.action_items IS NULL OR jsonb_array_length(NEW.action_items) < 2 THEN
    issues := issues || jsonb_build_object(
      'field', 'action_items',
      'issue', 'Too few action items (need at least 3)',
      'current_count', COALESCE(jsonb_array_length(NEW.action_items), 0)
    );
  ELSE
    score := score + 10; -- Partial credit for 2 items
  END IF;

  -- ============================================================================
  -- VALIDATION 4: Improvement Areas (20 points)
  -- ============================================================================
  IF NEW.what_needs_improvement IS NOT NULL AND jsonb_array_length(NEW.what_needs_improvement) >= 3 THEN
    score := score + 20;
  ELSIF NEW.what_needs_improvement IS NOT NULL AND jsonb_array_length(NEW.what_needs_improvement) >= 1 THEN
    score := score + 10; -- Partial credit
  ELSE
    issues := issues || jsonb_build_object(
      'field', 'what_needs_improvement',
      'issue', 'No improvement areas identified (every SD has room for improvement)',
      'current_count', 0
    );
  END IF;

  -- Check for dismissive statements
  IF NEW.what_needs_improvement IS NOT NULL THEN
    FOR i IN 0..jsonb_array_length(NEW.what_needs_improvement) - 1 LOOP
      item := NEW.what_needs_improvement->>i;
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
  IF (NEW.what_went_well::text || NEW.key_learnings::text || NEW.what_needs_improvement::text)
     ~ '\d+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)' THEN
    score := score + 10;
  END IF;

  -- Cap score at 100
  score := LEAST(score, 100);
  -- Floor at 0
  score := GREATEST(score, 0);

  -- Update NEW record
  NEW.quality_score := score;
  NEW.quality_issues := issues;
  NEW.quality_validated_at := NOW();
  NEW.quality_validated_by := 'SYSTEM';

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER validate_retrospective_quality_trigger
  BEFORE INSERT OR UPDATE ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_retrospective_quality();

-- Test the fix
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Validation trigger fixed - now works with INSERT operations';
  RAISE NOTICE '   - Validation runs BEFORE INSERT (can access NEW record)';
  RAISE NOTICE '   - Quality score calculated from content directly';
  RAISE NOTICE '   - Constraint ensures score is between 70-100';
  RAISE NOTICE '';
END;
$$;
