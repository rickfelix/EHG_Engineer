-- Migration: Add protocol_improvements field to retrospectives table
-- Purpose: Ensure retrospectives explicitly capture LEO Protocol improvements
-- Evidence: User request to ensure retrospectives address LEO Protocol Improvements
-- Date: 2025-12-04

-- ============================================================================
-- 1. ADD protocol_improvements JSONB FIELD
-- ============================================================================
-- This field will store structured protocol improvement suggestions
-- Format: Array of objects with category, improvement, evidence, and impact

ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS protocol_improvements JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN retrospectives.protocol_improvements IS 'Array of LEO Protocol improvement suggestions. Each object: { category: string, improvement: string, evidence: string, impact: string, affected_phase: LEAD|PLAN|EXEC|null }';

-- ============================================================================
-- 2. ADD CHECK CONSTRAINT FOR VALID STRUCTURE
-- ============================================================================
-- Validates that protocol_improvements is always an array

ALTER TABLE retrospectives
ADD CONSTRAINT check_protocol_improvements_is_array
CHECK (jsonb_typeof(protocol_improvements) = 'array' OR protocol_improvements IS NULL);

-- ============================================================================
-- 3. ADD QUALITY VALIDATION TRIGGER
-- ============================================================================
-- For PROCESS_IMPROVEMENT category, protocol_improvements SHOULD NOT be empty

CREATE OR REPLACE FUNCTION validate_protocol_improvements_for_process_category()
RETURNS TRIGGER AS $$
BEGIN
  -- If learning_category is PROCESS_IMPROVEMENT, warn if protocol_improvements is empty
  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    IF NEW.protocol_improvements IS NULL OR jsonb_array_length(NEW.protocol_improvements) = 0 THEN
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

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS validate_protocol_improvements_trigger ON retrospectives;

-- Create trigger
CREATE TRIGGER validate_protocol_improvements_trigger
  BEFORE INSERT OR UPDATE ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION validate_protocol_improvements_for_process_category();

-- ============================================================================
-- 4. ADD INDEX FOR EFFICIENT QUERYING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_retrospectives_protocol_improvements_gin
  ON retrospectives USING gin (protocol_improvements);

-- ============================================================================
-- 5. HELPER FUNCTION TO EXTRACT PROTOCOL IMPROVEMENTS
-- ============================================================================
-- Used by scripts to analyze retrospectives for protocol updates

CREATE OR REPLACE FUNCTION get_all_protocol_improvements(since_date DATE DEFAULT NULL)
RETURNS TABLE (
  retro_id UUID,
  sd_id TEXT,
  conducted_date TIMESTAMPTZ,
  learning_category TEXT,
  improvement JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id as retro_id,
    r.sd_id,
    r.conducted_date,
    r.learning_category,
    jsonb_array_elements(r.protocol_improvements) as improvement
  FROM retrospectives r
  WHERE
    r.protocol_improvements IS NOT NULL
    AND jsonb_array_length(r.protocol_improvements) > 0
    AND (since_date IS NULL OR r.conducted_date >= since_date);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_all_protocol_improvements IS 'Extracts all protocol improvements from retrospectives for analysis. Usage: SELECT * FROM get_all_protocol_improvements(''2025-01-01'');';

-- ============================================================================
-- 6. VIEW FOR PROTOCOL IMPROVEMENT ANALYSIS
-- ============================================================================

CREATE OR REPLACE VIEW v_protocol_improvements_analysis AS
SELECT
  r.id as retro_id,
  r.sd_id,
  r.title as retro_title,
  r.conducted_date,
  r.learning_category,
  r.quality_score,
  jsonb_array_length(r.protocol_improvements) as improvement_count,
  pi.improvement->>'category' as improvement_category,
  pi.improvement->>'improvement' as improvement_text,
  pi.improvement->>'evidence' as evidence,
  pi.improvement->>'impact' as impact,
  pi.improvement->>'affected_phase' as affected_phase
FROM retrospectives r
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(r.protocol_improvements, '[]'::jsonb)
) AS pi(improvement)
WHERE jsonb_array_length(COALESCE(r.protocol_improvements, '[]'::jsonb)) > 0;

COMMENT ON VIEW v_protocol_improvements_analysis IS 'Flattened view of all protocol improvements for reporting and analysis';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON v_protocol_improvements_analysis TO authenticated;
GRANT SELECT ON v_protocol_improvements_analysis TO service_role;
GRANT EXECUTE ON FUNCTION get_all_protocol_improvements TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_protocol_improvements TO service_role;

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================
-- DROP VIEW IF EXISTS v_protocol_improvements_analysis;
-- DROP FUNCTION IF EXISTS get_all_protocol_improvements;
-- DROP TRIGGER IF EXISTS validate_protocol_improvements_trigger ON retrospectives;
-- DROP FUNCTION IF EXISTS validate_protocol_improvements_for_process_category;
-- ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_protocol_improvements_is_array;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS protocol_improvements;
