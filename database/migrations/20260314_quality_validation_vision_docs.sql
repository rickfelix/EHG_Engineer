-- Migration: Quality validation trigger for eva_vision_documents
-- Purpose: Add quality_checked flag + auto-validation trigger
-- Behavior: FLAGS (quality_checked=false) but does NOT block insertion
-- Evidence-based thresholds from empirical analysis

-- Add quality columns
ALTER TABLE eva_vision_documents ADD COLUMN IF NOT EXISTS quality_checked BOOLEAN DEFAULT FALSE;
ALTER TABLE eva_vision_documents ADD COLUMN IF NOT EXISTS quality_issues JSONB DEFAULT '[]'::jsonb;
ALTER TABLE eva_vision_documents ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ;

-- Create validation function
CREATE OR REPLACE FUNCTION auto_validate_vision_quality()
RETURNS TRIGGER AS $$
DECLARE
  issues JSONB := '[]'::jsonb;
  passed BOOLEAN := TRUE;
  content_len INTEGER;
  standard_count INTEGER := 0;
  empty_section_count INTEGER := 0;
  section_key TEXT;
  section_value TEXT;
  should_recalculate BOOLEAN := FALSE;
  v_standard_keys TEXT[] := ARRAY[
    'executive_summary', 'problem_statement', 'success_criteria',
    'personas', 'out_of_scope', 'evolution_plan',
    'information_architecture', 'key_decision_points',
    'integration_patterns', 'ui_ux_wireframes'
  ];
BEGIN
  -- Only recalculate when content changes
  IF TG_OP = 'INSERT' THEN
    should_recalculate := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.content IS DISTINCT FROM NEW.content) OR
       (OLD.sections IS DISTINCT FROM NEW.sections) THEN
      should_recalculate := TRUE;
    END IF;
  END IF;

  IF NOT should_recalculate THEN
    RETURN NEW;
  END IF;

  content_len := length(COALESCE(NEW.content, ''));

  -- Check 1: Content length >= 5,000 chars
  -- Evidence: Blocks 8 docs (11.4%) including 2 placeholders. Good-linked docs median 9,390.
  IF content_len < 5000 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'content_length',
      'message', format('Content is %s chars (minimum 5,000). Today''s docs average 3,577 vs 15,789 for older successful docs.', content_len)
    );
  END IF;

  -- Check 2: Standard sections >= 8 of 10
  -- Evidence: All 13 vision docs linked to successful SDs have 10/10 standard sections.
  IF NEW.sections IS NOT NULL AND jsonb_typeof(NEW.sections) = 'object' THEN
    FOREACH section_key IN ARRAY v_standard_keys LOOP
      IF NEW.sections ? section_key THEN
        standard_count := standard_count + 1;
        -- Check 3: No empty sections (each >= 50 chars)
        -- Evidence: 1 doc has 9 empty standard sections — clear quality failure.
        IF length(COALESCE(NEW.sections->>section_key, '')) < 50 THEN
          empty_section_count := empty_section_count + 1;
        END IF;
      END IF;
    END LOOP;

    IF standard_count < 8 THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'section_coverage',
        'message', format('Only %s of 10 standard sections present (minimum 8). All successful vision docs have 10/10.', standard_count)
      );
    END IF;

    IF empty_section_count > 0 THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'section_content',
        'message', format('%s section(s) have less than 50 chars. Stub sections indicate incomplete thinking.', empty_section_count)
      );
    END IF;
  ELSE
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'sections_missing',
      'message', 'Sections JSONB is NULL. Vision docs require structured sections for downstream scoring.'
    );
  END IF;

  NEW.quality_checked := passed;
  NEW.quality_issues := issues;
  NEW.quality_checked_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_validate_vision_quality ON eva_vision_documents;
CREATE TRIGGER trg_auto_validate_vision_quality
  BEFORE INSERT OR UPDATE ON eva_vision_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_vision_quality();

-- Rollback SQL:
-- DROP TRIGGER IF EXISTS trg_auto_validate_vision_quality ON eva_vision_documents;
-- DROP FUNCTION IF EXISTS auto_validate_vision_quality();
-- ALTER TABLE eva_vision_documents DROP COLUMN IF EXISTS quality_checked;
-- ALTER TABLE eva_vision_documents DROP COLUMN IF EXISTS quality_issues;
-- ALTER TABLE eva_vision_documents DROP COLUMN IF EXISTS quality_checked_at;
