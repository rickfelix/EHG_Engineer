-- Migration: Quality validation trigger for eva_architecture_plans
-- Purpose: Add quality_checked flag + auto-validation trigger
-- Behavior: FLAGS (quality_checked=false) but does NOT block insertion
-- Evidence-based thresholds from empirical analysis

-- Add quality columns
ALTER TABLE eva_architecture_plans ADD COLUMN IF NOT EXISTS quality_checked BOOLEAN DEFAULT FALSE;
ALTER TABLE eva_architecture_plans ADD COLUMN IF NOT EXISTS quality_issues JSONB DEFAULT '[]'::jsonb;
ALTER TABLE eva_architecture_plans ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ;

-- Create validation function
CREATE OR REPLACE FUNCTION auto_validate_archplan_quality()
RETURNS TRIGGER AS $$
DECLARE
  issues JSONB := '[]'::jsonb;
  passed BOOLEAN := TRUE;
  content_len INTEGER;
  section_count INTEGER := 0;
  should_recalculate BOOLEAN := FALSE;
  v_metadata_keys TEXT[] := ARRAY['extracted_at', 'extraction_source'];
  section_key TEXT;
BEGIN
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
  -- Evidence: Blocks 4 weakest docs (6.0%). All 4 are structurally weak.
  IF content_len < 5000 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'content_length',
      'message', format('Content is %s chars (minimum 5,000). Median for all plans is 10,233.', content_len)
    );
  END IF;

  -- Check 2: Sections must exist
  -- Evidence: 18/67 (26.9%) have null sections — biggest structural quality gap.
  IF NEW.sections IS NULL OR jsonb_typeof(NEW.sections) != 'object' THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'sections_missing',
      'message', 'Sections JSONB is NULL. 27% of arch plans lack sections — this correlates with incomplete implementation.'
    );
  ELSE
    -- Check 3: Has implementation_phases with content
    -- Evidence: Critical for EXEC planning. 47/67 plans have it.
    IF NOT (NEW.sections ? 'implementation_phases') THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'implementation_phases_missing',
        'message', 'Missing implementation_phases section. This is critical for EXEC phase planning.'
      );
    ELSIF jsonb_typeof(NEW.sections->'implementation_phases') = 'array'
          AND jsonb_array_length(NEW.sections->'implementation_phases') = 0 THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'implementation_phases_empty',
        'message', 'implementation_phases is an empty array. Must contain at least 1 phase with deliverables.'
      );
    END IF;

    -- Check 4: At least 3 substantive sections (beyond metadata)
    -- Evidence: Extraction format baseline has 3+ sections.
    FOR section_key IN SELECT key FROM jsonb_object_keys(NEW.sections) AS key LOOP
      IF NOT (section_key = ANY(v_metadata_keys)) THEN
        section_count := section_count + 1;
      END IF;
    END LOOP;

    IF section_count < 3 THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'section_count',
        'message', format('Only %s substantive sections (minimum 3). Rich-format plans average 8 sections.', section_count)
      );
    END IF;
  END IF;

  NEW.quality_checked := passed;
  NEW.quality_issues := issues;
  NEW.quality_checked_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_validate_archplan_quality ON eva_architecture_plans;
CREATE TRIGGER trg_auto_validate_archplan_quality
  BEFORE INSERT OR UPDATE ON eva_architecture_plans
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_archplan_quality();

-- Rollback SQL:
-- DROP TRIGGER IF EXISTS trg_auto_validate_archplan_quality ON eva_architecture_plans;
-- DROP FUNCTION IF EXISTS auto_validate_archplan_quality();
-- ALTER TABLE eva_architecture_plans DROP COLUMN IF EXISTS quality_checked;
-- ALTER TABLE eva_architecture_plans DROP COLUMN IF EXISTS quality_issues;
-- ALTER TABLE eva_architecture_plans DROP COLUMN IF EXISTS quality_checked_at;
