-- =============================================================================
-- Migration: Fix retrospective publish-gate trigger ordering
-- SD: SD-FDBK-FIX-FIX-RETROSPECTIVE-TRIGGER-001
-- Harness backlog ref: 8bc451f0
-- Date: 2026-05-23
--
-- Problem:
--   PostgreSQL fires BEFORE-row triggers alphabetically by trigger name.
--   "trigger_auto_populate_retrospective_fields" (t) fires BEFORE
--   "validate_retrospective_quality_trigger" (v).
--
--   auto_populate_retrospective_fields() contained a quality_score >= 70
--   publish-gate RAISE that ran while NEW.quality_score was still NULL/0
--   (before auto_validate_retrospective_quality() computed it).
--   This caused P0001 on any direct status=PUBLISHED insert with good content.
--
-- Fix (per PRD hard constraints):
--   FR-4: Trigger NAMES are unchanged (renaming orphans historical migrations).
--   FR-3: Score-computation logic in auto_validate_retrospective_quality()
--         is preserved byte-identical. action_items non-empty check stays in
--         auto_populate (it does not depend on score).
--   FR-2: quality_score >= 70 enforcement is RELOCATED to
--         auto_validate_retrospective_quality(), placed AFTER
--         NEW.quality_score is set, and runs REGARDLESS of should_recalculate
--         (covers the status-only DRAFT->PUBLISHED UPDATE where score is not
--         recomputed — enforces against the stored/computed NEW.quality_score).
--
-- Publish-transition predicate used (consistent with existing code):
--   (TG_OP='INSERT' AND NEW.status='PUBLISHED')
--   OR (TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM 'PUBLISHED'
--       AND NEW.status='PUBLISHED')
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Part 1: Remove quality_score >= 70 RAISE from auto_populate_retrospective_fields
--         All other logic is byte-identical to the live function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_populate_retrospective_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  is_status_changing_to_published BOOLEAN := FALSE;
  is_learning_category_changing BOOLEAN := FALSE;
BEGIN

  -- SD-LEO-FIX-FIX-AUTO-POPULATE-001: Predicate corrected. Was:
  --   IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
  -- The bare `TG_OP = 'INSERT'` disjunct ignored NEW.status, so DRAFT inserts hit the
  -- PUBLISHED gate. Now an INSERT only counts as a publish transition when its target
  -- status IS PUBLISHED.
  IF (TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED')
     OR (TG_OP = 'UPDATE' AND OLD.status != 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
    is_status_changing_to_published := TRUE;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.learning_category IS NULL OR OLD.learning_category != NEW.learning_category)) THEN
    is_learning_category_changing := TRUE;
  END IF;


  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    NEW.applies_to_all_apps := TRUE;
  ELSIF NEW.learning_category IS NOT NULL THEN
    NEW.applies_to_all_apps := FALSE;
  END IF;


  IF is_learning_category_changing AND
     NEW.learning_category = 'APPLICATION_ISSUE' AND
     (NEW.affected_components IS NULL OR array_length(NEW.affected_components, 1) IS NULL) THEN
    RAISE EXCEPTION 'APPLICATION_ISSUE retrospectives must have at least one affected_component'
      USING HINT = 'Add affected components like ["Authentication", "Database", "API"]';
  END IF;

  IF is_status_changing_to_published THEN
    IF NEW.action_items IS NULL OR
       NEW.action_items = 'null'::jsonb OR
       jsonb_typeof(NEW.action_items) = 'null' THEN
      RAISE EXCEPTION 'PUBLISHED retrospectives must have non-empty action_items'
        USING HINT = 'Add concrete action items to prevent future issues';
    END IF;

    IF jsonb_typeof(NEW.action_items) = 'string' AND
       LENGTH(TRIM(NEW.action_items#>>'{}'::text[])) = 0 THEN
      RAISE EXCEPTION 'PUBLISHED retrospectives must have non-empty action_items'
        USING HINT = 'Add concrete action items to prevent future issues';
    END IF;
  END IF;

  -- NOTE: quality_score >= 70 publish-gate enforcement REMOVED from here.
  -- It has been relocated to auto_validate_retrospective_quality() so it runs
  -- AFTER the score is computed (SD-FDBK-FIX-FIX-RETROSPECTIVE-TRIGGER-001).

  IF NEW.related_files IS NOT NULL AND array_length(NEW.related_files, 1) > 0 THEN
    DECLARE
      invalid_files TEXT[] := ARRAY[]::TEXT[];
      file TEXT;
    BEGIN
      FOREACH file IN ARRAY NEW.related_files LOOP
        IF file !~ '\.(js|ts|jsx|tsx|json|sql|md|yml|yaml|css|html|py|sh)$' THEN
          invalid_files := array_append(invalid_files, file);
        END IF;
      END LOOP;

      IF array_length(invalid_files, 1) > 0 THEN
        RAISE WARNING 'Potentially invalid file paths detected: %', invalid_files
          USING HINT = 'File paths should have valid extensions (.js, .ts, .sql, etc.)';
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Part 2: Add quality_score >= 70 enforcement to auto_validate_retrospective_quality
--         after the score is computed, covering both should_recalculate paths.
--         Score-computation logic is byte-identical to the live function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_validate_retrospective_quality()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    -- Score is NOT recomputed (status-only UPDATE, no content change).
    -- NEW.quality_score holds the stored value from the previous INSERT/UPDATE.
    -- FR-2: Still enforce the publish gate against that stored score.
    IF (TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED')
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
      IF NEW.quality_score IS NULL OR NEW.quality_score < 70 THEN
        RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
          USING HINT = 'Improve retrospective completeness to reach 70+ score';
      END IF;
    END IF;
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

  -- FR-2 + SD-FDBK-FIX-FIX-RETROSPECTIVE-TRIGGER-001:
  -- Enforce the publish gate AFTER the score has been computed (above).
  -- This covers the primary bug path: direct PUBLISHED INSERT where the score
  -- was just freshly computed and must be validated before persisting.
  IF (TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED')
     OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
    IF NEW.quality_score IS NULL OR NEW.quality_score < 70 THEN
      RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
        USING HINT = 'Improve retrospective completeness to reach 70+ score';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
