-- Migration: Make quality validation trigger conditional
-- Issue: SD-RETRO-ENHANCE-001 (final fix for embedding generation)
-- Created: 2025-10-16
--
-- Problem: auto_validate_retrospective_quality() trigger runs on EVERY UPDATE
-- and recalculates quality_score, even for embedding-only updates
--
-- Root Cause: Trigger doesn't check if content fields were actually modified
-- Result: Embedding updates trigger quality recalculation, causing scores to drop
-- and potentially violate CHECK constraint (must be NULL or >=70)
--
-- Solution: Make trigger conditional - only recalculate quality_score when:
-- 1. INSERT operation, OR
-- 2. One of the content fields changed (what_went_well, key_learnings, action_items, what_needs_improvement)
-- 3. Skip recalculation for metadata-only updates (embeddings, timestamps, etc.)

BEGIN;

-- Drop and recreate quality validation trigger with conditional logic
DROP TRIGGER IF EXISTS validate_retrospective_quality_trigger ON retrospectives;

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
BEGIN
  -- ========================================================================
  -- CONDITIONAL EXECUTION: Only recalculate if content fields changed
  -- ========================================================================

  -- Always recalculate on INSERT
  IF TG_OP = 'INSERT' THEN
    should_recalculate := TRUE;

  -- On UPDATE, only recalculate if content fields changed
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.what_went_well IS DISTINCT FROM NEW.what_went_well) OR
       (OLD.key_learnings IS DISTINCT FROM NEW.key_learnings) OR
       (OLD.action_items IS DISTINCT FROM NEW.action_items) OR
       (OLD.what_needs_improvement IS DISTINCT FROM NEW.what_needs_improvement) OR
       (OLD.challenges_faced IS DISTINCT FROM NEW.challenges_faced) THEN
      should_recalculate := TRUE;
    END IF;
  END IF;

  -- If no content changes, skip recalculation and return unchanged
  IF NOT should_recalculate THEN
    RETURN NEW;
  END IF;

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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_validate_retrospective_quality() IS
'SD-RETRO-ENHANCE-001 Layer 2: Quality validation (CONDITIONAL - only recalculates when content fields change)';

-- Recreate trigger
CREATE TRIGGER validate_retrospective_quality_trigger
BEFORE INSERT OR UPDATE ON retrospectives
FOR EACH ROW
EXECUTE FUNCTION auto_validate_retrospective_quality();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'validate_retrospective_quality_trigger'
      AND tgrelid = 'retrospectives'::regclass
  ) THEN
    RAISE EXCEPTION 'Quality validation trigger not created';
  END IF;
  RAISE NOTICE '✅ Conditional quality validation trigger verified';
END $$;

COMMIT;

-- ============================================================================
-- Testing
-- ============================================================================

-- Test 1: Embedding-only update should NOT recalculate quality_score
-- UPDATE retrospectives
-- SET content_embedding = '[1,2,3]'::vector
-- WHERE id = '[UUID]';
-- Expected: SUCCESS, quality_score unchanged

-- Test 2: Content field update SHOULD recalculate quality_score
-- UPDATE retrospectives
-- SET what_went_well = '["New item 1", "New item 2", "New item 3", "New item 4", "New item 5"]'::jsonb
-- WHERE id = '[UUID]';
-- Expected: SUCCESS, quality_score recalculated

-- Test 3: INSERT should always calculate quality_score
-- INSERT INTO retrospectives (title, target_application, learning_category, ...)
-- VALUES (...);
-- Expected: SUCCESS, quality_score calculated
