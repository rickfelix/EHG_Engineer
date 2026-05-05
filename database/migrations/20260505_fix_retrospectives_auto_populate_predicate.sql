-- Migration: Fix auto_populate_retrospective_fields trigger predicate so DRAFT inserts
-- skip the PUBLISHED-only quality_score >= 70 gate.
--
-- SD: SD-LEO-FIX-FIX-AUTO-POPULATE-001
-- Originating feedback: d637a3fb-12c9-4f1d-aca6-25f32d9febd0
-- Originating paused SD: SD-MAN-INFRA-TRIAGE-377-PRE-001 (PLAN_VERIFICATION; will resume after this lands)
--
-- Bug: The current INSERT branch of is_status_changing_to_published predicate is
--      `IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'PUBLISHED' AND NEW.status = 'PUBLISHED')`
--      which ignores NEW.status entirely on INSERT — every insert is treated as a publish
--      transition, firing the PUBLISHED-only quality_score gate even on status='DRAFT' rows.
--      The score-computing trigger (auto_validate_retrospective_quality, alphabetically later)
--      never gets to run.
--
-- Fix: Require NEW.status = 'PUBLISHED' on the INSERT branch.
--      `IF (TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED') OR (TG_OP = 'UPDATE' AND OLD.status != 'PUBLISHED' AND NEW.status = 'PUBLISHED')`
--
-- Idempotency: CREATE OR REPLACE — re-running this migration is a no-op once the new function is in place.
-- Rollback: redeploy the prior function definition (preserved as a SQL comment block below).

BEGIN;

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

  IF is_status_changing_to_published AND
     (NEW.quality_score IS NULL OR NEW.quality_score < 70) THEN
    RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
      USING HINT = 'Improve retrospective completeness to reach 70+ score';
  END IF;

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

COMMIT;
