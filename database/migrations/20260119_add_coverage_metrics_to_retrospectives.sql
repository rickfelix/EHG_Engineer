-- SD-LEARN-011: FR-3 - Test Coverage Metrics in Retrospectives
-- Purpose: Add pre/post coverage metrics for testing/qa SDs
-- Date: 2026-01-19

-- ============================================================================
-- ADD COVERAGE METRICS COLUMNS
-- ============================================================================

-- Check if columns exist before adding (idempotent)
DO $$
BEGIN
  -- coverage_tool: What tool measured coverage (jest, istanbul, c8, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives' AND column_name = 'coverage_tool'
  ) THEN
    ALTER TABLE retrospectives ADD COLUMN coverage_tool VARCHAR(50);
    COMMENT ON COLUMN retrospectives.coverage_tool IS 'Coverage measurement tool used (jest, istanbul, c8, nyc, etc.)';
  END IF;

  -- coverage_pre_percent: Coverage percentage BEFORE implementation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives' AND column_name = 'coverage_pre_percent'
  ) THEN
    ALTER TABLE retrospectives ADD COLUMN coverage_pre_percent DECIMAL(5,2);
    COMMENT ON COLUMN retrospectives.coverage_pre_percent IS 'Test coverage percentage before SD implementation';
  END IF;

  -- coverage_post_percent: Coverage percentage AFTER implementation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives' AND column_name = 'coverage_post_percent'
  ) THEN
    ALTER TABLE retrospectives ADD COLUMN coverage_post_percent DECIMAL(5,2);
    COMMENT ON COLUMN retrospectives.coverage_post_percent IS 'Test coverage percentage after SD implementation';
  END IF;

  -- coverage_delta_percent: Computed difference (post - pre)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives' AND column_name = 'coverage_delta_percent'
  ) THEN
    ALTER TABLE retrospectives ADD COLUMN coverage_delta_percent DECIMAL(5,2);
    COMMENT ON COLUMN retrospectives.coverage_delta_percent IS 'Coverage change (post - pre), can be negative';
  END IF;
END $$;

-- ============================================================================
-- FUNCTION: Validate Coverage Metrics for Testing/QA SDs
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_retrospective_coverage()
RETURNS TRIGGER AS $$
DECLARE
  sd_type_val VARCHAR;
BEGIN
  -- Get the SD type for this retrospective
  SELECT sd_type INTO sd_type_val
  FROM strategic_directives_v2
  WHERE id = NEW.sd_id;

  -- For testing/qa SDs, coverage metrics are required
  IF sd_type_val IN ('testing', 'qa') THEN
    -- Check required fields
    IF NEW.coverage_pre_percent IS NULL THEN
      RAISE EXCEPTION 'Retrospective for testing/qa SD requires coverage_pre_percent';
    END IF;

    IF NEW.coverage_post_percent IS NULL THEN
      RAISE EXCEPTION 'Retrospective for testing/qa SD requires coverage_post_percent';
    END IF;

    -- Auto-compute coverage_delta_percent if not provided
    IF NEW.coverage_delta_percent IS NULL THEN
      NEW.coverage_delta_percent := ROUND(NEW.coverage_post_percent - NEW.coverage_pre_percent, 2);
    END IF;

    -- Validate coverage_tool is provided
    IF NEW.coverage_tool IS NULL OR NEW.coverage_tool = '' THEN
      RAISE WARNING 'Coverage tool not specified for testing/qa SD retrospective - consider adding for traceability';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_validate_retrospective_coverage ON retrospectives;

-- Create trigger for coverage validation
CREATE TRIGGER trg_validate_retrospective_coverage
  BEFORE INSERT OR UPDATE ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION validate_retrospective_coverage();

-- ============================================================================
-- FUNCTION: Get Coverage Summary for SD
-- ============================================================================

CREATE OR REPLACE FUNCTION get_sd_coverage_summary(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  sd_record RECORD;
  retro_record RECORD;
BEGIN
  -- Get SD info
  SELECT id, sd_key, sd_type INTO sd_record
  FROM strategic_directives_v2
  WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Get latest retrospective with coverage data
  SELECT
    coverage_tool,
    coverage_pre_percent,
    coverage_post_percent,
    coverage_delta_percent,
    code_coverage_delta -- Legacy field
  INTO retro_record
  FROM retrospectives
  WHERE sd_id = sd_id_param
  ORDER BY created_at DESC
  LIMIT 1;

  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_record.sd_type,
    'requires_coverage_metrics', sd_record.sd_type IN ('testing', 'qa'),
    'coverage', CASE
      WHEN retro_record.coverage_pre_percent IS NOT NULL THEN
        jsonb_build_object(
          'tool', retro_record.coverage_tool,
          'pre_percent', retro_record.coverage_pre_percent,
          'post_percent', retro_record.coverage_post_percent,
          'delta_percent', retro_record.coverage_delta_percent,
          'improved', COALESCE(retro_record.coverage_delta_percent, 0) > 0
        )
      ELSE
        jsonb_build_object(
          'message', 'No coverage metrics recorded',
          'legacy_delta', retro_record.code_coverage_delta
        )
    END
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  col_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'retrospectives'
  AND column_name IN ('coverage_tool', 'coverage_pre_percent', 'coverage_post_percent', 'coverage_delta_percent');

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-LEARN-011 FR-3: Coverage Metrics Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Columns added/verified: %', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New columns:';
  RAISE NOTICE '  - coverage_tool: VARCHAR(50) - measurement tool name';
  RAISE NOTICE '  - coverage_pre_percent: DECIMAL(5,2) - coverage before';
  RAISE NOTICE '  - coverage_post_percent: DECIMAL(5,2) - coverage after';
  RAISE NOTICE '  - coverage_delta_percent: DECIMAL(5,2) - computed delta';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - validate_retrospective_coverage() - trigger function';
  RAISE NOTICE '  - get_sd_coverage_summary(sd_id) - query helper';
  RAISE NOTICE '';
  RAISE NOTICE 'Behavior:';
  RAISE NOTICE '  - For sd_type=testing/qa: coverage metrics required';
  RAISE NOTICE '  - coverage_delta_percent auto-computed if not provided';
  RAISE NOTICE '  - Warning (not error) if coverage_tool missing';
  RAISE NOTICE '============================================================';
END $$;
