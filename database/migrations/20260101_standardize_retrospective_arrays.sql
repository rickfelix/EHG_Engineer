-- Migration: Standardize retrospective array formats
-- Purpose: Convert string items to object format in key_learnings, success_patterns, failure_patterns
-- Target format: { "learning": "text" } for key_learnings, { "pattern": "text" } for patterns
-- Date: 2026-01-01

-- ============================================================
-- STEP 1: Create helper function to convert array items
-- ============================================================

CREATE OR REPLACE FUNCTION convert_array_strings_to_objects(
  arr jsonb,
  text_key text DEFAULT 'learning'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  item jsonb;
BEGIN
  IF arr IS NULL OR jsonb_array_length(arr) = 0 THEN
    RETURN arr;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(arr)
  LOOP
    IF jsonb_typeof(item) = 'string' THEN
      -- Convert string to object: "text" -> {"learning": "text"}
      result := result || jsonb_build_array(
        jsonb_build_object(text_key, item #>> '{}')
      );
    ELSE
      -- Already an object, keep as-is
      result := result || jsonb_build_array(item);
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION convert_array_strings_to_objects IS
'Converts string items in a JSONB array to objects with specified key. Used for retrospective standardization.';

-- ============================================================
-- STEP 2: Migrate key_learnings (string -> {learning: string})
-- ============================================================

UPDATE retrospectives
SET key_learnings = convert_array_strings_to_objects(key_learnings, 'learning'),
    updated_at = NOW()
WHERE key_learnings IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(key_learnings) elem
    WHERE jsonb_typeof(elem) = 'string'
  );

-- ============================================================
-- STEP 3: Migrate success_patterns (string -> {pattern: string})
-- ============================================================

UPDATE retrospectives
SET success_patterns = convert_array_strings_to_objects(success_patterns, 'pattern'),
    updated_at = NOW()
WHERE success_patterns IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(success_patterns) elem
    WHERE jsonb_typeof(elem) = 'string'
  );

-- ============================================================
-- STEP 4: Migrate failure_patterns (string -> {pattern: string})
-- ============================================================

UPDATE retrospectives
SET failure_patterns = convert_array_strings_to_objects(failure_patterns, 'pattern'),
    updated_at = NOW()
WHERE failure_patterns IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(failure_patterns) elem
    WHERE jsonb_typeof(elem) = 'string'
  );

-- ============================================================
-- STEP 5: Add schema documentation comment
-- ============================================================

COMMENT ON COLUMN retrospectives.key_learnings IS
'JSONB array of learning objects. Schema: [{"learning": "text", "evidence": "optional", "category": "optional"}]';

COMMENT ON COLUMN retrospectives.success_patterns IS
'JSONB array of pattern objects. Schema: [{"pattern": "text", "context": "optional"}]';

COMMENT ON COLUMN retrospectives.failure_patterns IS
'JSONB array of pattern objects. Schema: [{"pattern": "text", "context": "optional"}]';

-- ============================================================
-- STEP 6: Verify migration
-- ============================================================

DO $$
DECLARE
  string_count integer;
BEGIN
  SELECT COUNT(*) INTO string_count
  FROM retrospectives r,
       jsonb_array_elements(r.key_learnings) elem
  WHERE jsonb_typeof(elem) = 'string';

  IF string_count > 0 THEN
    RAISE WARNING 'Migration incomplete: % string items remain in key_learnings', string_count;
  ELSE
    RAISE NOTICE 'Migration complete: All key_learnings items are now objects';
  END IF;
END $$;
