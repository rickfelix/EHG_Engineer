-- Migration: Quality validation trigger for strategic_directives_v2
-- Purpose: Add quality_checked flag + auto-validation trigger
-- Behavior: FLAGS (quality_checked=false) but does NOT block insertion
-- CAUTION: This table has 38 existing triggers. This trigger is lightweight —
-- only fires recalculation when content-related fields change.
-- Evidence-based thresholds from empirical analysis

-- Add quality columns
ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS quality_checked BOOLEAN DEFAULT FALSE;
ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS quality_issues JSONB DEFAULT '[]'::jsonb;
ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ;

-- Create validation function
CREATE OR REPLACE FUNCTION auto_validate_sd_content_quality()
RETURNS TRIGGER AS $$
DECLARE
  issues JSONB := '[]'::jsonb;
  passed BOOLEAN := TRUE;
  should_recalculate BOOLEAN := FALSE;
  sm_count INTEGER := 0;
  risk_count INTEGER := 0;
  sc_count INTEGER := 0;
BEGIN
  -- Only recalculate when content-related fields change
  IF TG_OP = 'INSERT' THEN
    should_recalculate := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.description IS DISTINCT FROM NEW.description) OR
       (OLD.rationale IS DISTINCT FROM NEW.rationale) OR
       (OLD.scope IS DISTINCT FROM NEW.scope) OR
       (OLD.success_criteria IS DISTINCT FROM NEW.success_criteria) OR
       (OLD.success_metrics IS DISTINCT FROM NEW.success_metrics) OR
       (OLD.risks IS DISTINCT FROM NEW.risks) THEN
      should_recalculate := TRUE;
    END IF;
  END IF;

  IF NOT should_recalculate THEN
    RETURN NEW;
  END IF;

  -- Check 1: Description >= 100 chars
  -- Evidence: Good SD p25 = 149 chars. Filters the shortest 4%.
  IF length(COALESCE(NEW.description, '')) < 100 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'description_length',
      'message', format('Description is %s chars (minimum 100). Good SDs have p25=149 chars.', length(COALESCE(NEW.description, '')))
    );
  END IF;

  -- Check 2: Boilerplate scope detection
  -- Evidence: "Address identified patterns..." has 49.1% cancellation rate vs 8.3% baseline.
  IF COALESCE(NEW.scope, '') = 'Address identified patterns and implement suggested improvements.' THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'boilerplate_scope',
      'message', 'Scope is a known boilerplate pattern with 49.1% cancellation rate. Provide specific scope.'
    );
  END IF;

  -- Check 3: Auto-generated rationale detection
  -- Evidence: "Accumulated..." prefix has 40.9% cancellation rate.
  IF COALESCE(NEW.rationale, '') LIKE 'Accumulated%item(s) from retrospectives%' THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'boilerplate_rationale',
      'message', 'Rationale is auto-generated "Accumulated from retrospectives" pattern with 40.9% cancellation rate. Provide specific rationale.'
    );
  END IF;

  -- Check 4: scope != description
  -- Evidence: 20% cancellation rate when identical vs 8.3% baseline.
  IF COALESCE(NEW.scope, '') = COALESCE(NEW.description, '') AND length(COALESCE(NEW.scope, '')) > 0 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'scope_description_duplicate',
      'message', 'Scope and description are identical. Duplicated SDs have 20% cancellation rate vs 8.3% baseline.'
    );
  END IF;

  -- Check 5: success_metrics >= 1
  -- Evidence: Strongest single-field signal. Good p25=3, Bad p25=1.
  IF NEW.success_metrics IS NOT NULL AND jsonb_typeof(NEW.success_metrics) = 'array' THEN
    sm_count := jsonb_array_length(NEW.success_metrics);
  END IF;
  IF sm_count < 1 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'success_metrics_missing',
      'message', 'No success metrics defined. This is the strongest predictor of SD outcome quality.'
    );
  END IF;

  -- Check 6: risks >= 1
  -- Evidence: 92.8% of cancelled SDs have 0 risks vs 44.3% of completed.
  IF NEW.risks IS NOT NULL AND jsonb_typeof(NEW.risks) = 'array' THEN
    risk_count := jsonb_array_length(NEW.risks);
  END IF;
  IF risk_count < 1 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'risks_missing',
      'message', 'No risks identified. 92.8% of cancelled SDs have 0 risks vs 44.3% of completed ones.'
    );
  END IF;

  -- Check 7: success_criteria >= 2
  -- Evidence: Minimum for meaningful acceptance criteria.
  IF NEW.success_criteria IS NOT NULL AND jsonb_typeof(NEW.success_criteria) = 'array' THEN
    sc_count := jsonb_array_length(NEW.success_criteria);
  END IF;
  IF sc_count < 2 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'success_criteria_insufficient',
      'message', format('Only %s success criteria (minimum 2). Good SDs have median 4.', sc_count)
    );
  END IF;

  NEW.quality_checked := passed;
  NEW.quality_issues := issues;
  NEW.quality_checked_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_validate_sd_content_quality ON strategic_directives_v2;
CREATE TRIGGER trg_auto_validate_sd_content_quality
  BEFORE INSERT OR UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_sd_content_quality();

-- Rollback SQL:
-- DROP TRIGGER IF EXISTS trg_auto_validate_sd_content_quality ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS auto_validate_sd_content_quality();
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS quality_checked;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS quality_issues;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS quality_checked_at;
