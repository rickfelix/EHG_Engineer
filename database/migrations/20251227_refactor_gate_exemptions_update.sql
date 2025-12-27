-- LEO Protocol Enhancement: Refactor Gate Exemptions
-- Purpose: Add intensity-aware gate exemptions for refactoring SDs
-- Extends: 20251227_sd_type_gate_exemptions.sql
-- Date: 2025-12-27

-- ============================================================================
-- REFACTOR GATE EXEMPTIONS (BASE - applies to all intensities)
-- ============================================================================

INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('refactor', 'E2E_TESTING', 'REQUIRED', 'Must verify no behavior change after refactoring'),
('refactor', 'TESTING_SUBAGENT', 'REQUIRED', 'Run existing tests to prove no regression'),
('refactor', 'CODE_VALIDATION', 'REQUIRED', 'Validate refactored code compiles and passes lint'),
('refactor', 'GIT_COMMIT_CHECK', 'REQUIRED', 'Track all refactoring changes'),
('refactor', 'DELIVERABLES_CHECK', 'OPTIONAL', 'Depends on intensity - architectural needs tracking'),
('refactor', 'HANDOFF_CHAIN', 'OPTIONAL', 'Cosmetic may skip EXEC-TO-PLAN handoff'),
('refactor', 'PRD_REQUIRED', 'OPTIONAL', 'Cosmetic uses Refactor Brief instead of PRD'),
('refactor', 'RETROSPECTIVE', 'OPTIONAL', 'Required only for architectural intensity'),
('refactor', 'REGRESSION_VALIDATION', 'REQUIRED', 'Must prove backward compatibility')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- ============================================================================
-- CREATE INTENSITY-SPECIFIC GATE EXEMPTIONS TABLE
-- ============================================================================
-- This extends sd_type_gate_exemptions for intensity-aware behavior

CREATE TABLE IF NOT EXISTS sd_intensity_gate_exemptions (
  id SERIAL PRIMARY KEY,
  sd_type VARCHAR(50) NOT NULL,
  intensity_level VARCHAR(20) NOT NULL CHECK (intensity_level IN ('cosmetic', 'structural', 'architectural')),
  gate_name VARCHAR(100) NOT NULL,
  exemption_type VARCHAR(20) NOT NULL CHECK (exemption_type IN ('SKIP', 'OPTIONAL', 'REQUIRED')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sd_type, intensity_level, gate_name)
);

COMMENT ON TABLE sd_intensity_gate_exemptions IS
'Intensity-specific gate exemptions. Overrides sd_type_gate_exemptions when intensity_level is set.';

-- ============================================================================
-- INSERT INTENSITY-SPECIFIC EXEMPTIONS FOR REFACTOR
-- ============================================================================

-- COSMETIC intensity: Lightest validation
INSERT INTO sd_intensity_gate_exemptions (sd_type, intensity_level, gate_name, exemption_type, reason) VALUES
('refactor', 'cosmetic', 'E2E_TESTING', 'OPTIONAL', 'Cosmetic changes unlikely to break E2E - optional verification'),
('refactor', 'cosmetic', 'TESTING_SUBAGENT', 'OPTIONAL', 'Quick lint/compile check sufficient'),
('refactor', 'cosmetic', 'DELIVERABLES_CHECK', 'SKIP', 'Cosmetic changes are self-documenting'),
('refactor', 'cosmetic', 'HANDOFF_CHAIN', 'SKIP', 'Single handoff allowed for cosmetic'),
('refactor', 'cosmetic', 'PRD_REQUIRED', 'SKIP', 'Refactor Brief replaces PRD for cosmetic'),
('refactor', 'cosmetic', 'RETROSPECTIVE', 'SKIP', 'No learnings needed for renames/formatting'),
('refactor', 'cosmetic', 'REGRESSION_VALIDATION', 'OPTIONAL', 'Low risk - optional regression check')
ON CONFLICT (sd_type, intensity_level, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- STRUCTURAL intensity: Standard validation
INSERT INTO sd_intensity_gate_exemptions (sd_type, intensity_level, gate_name, exemption_type, reason) VALUES
('refactor', 'structural', 'E2E_TESTING', 'REQUIRED', 'Structural changes need E2E verification'),
('refactor', 'structural', 'TESTING_SUBAGENT', 'REQUIRED', 'Run full test suite before/after'),
('refactor', 'structural', 'DELIVERABLES_CHECK', 'OPTIONAL', 'Track major component changes'),
('refactor', 'structural', 'HANDOFF_CHAIN', 'OPTIONAL', 'Standard 2-handoff chain'),
('refactor', 'structural', 'PRD_REQUIRED', 'OPTIONAL', 'Refactor Brief acceptable'),
('refactor', 'structural', 'RETROSPECTIVE', 'OPTIONAL', 'Capture learnings if significant'),
('refactor', 'structural', 'REGRESSION_VALIDATION', 'REQUIRED', 'Must verify no regression')
ON CONFLICT (sd_type, intensity_level, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- ARCHITECTURAL intensity: Full validation
INSERT INTO sd_intensity_gate_exemptions (sd_type, intensity_level, gate_name, exemption_type, reason) VALUES
('refactor', 'architectural', 'E2E_TESTING', 'REQUIRED', 'Architectural changes need comprehensive E2E'),
('refactor', 'architectural', 'TESTING_SUBAGENT', 'REQUIRED', 'Full test suite + REGRESSION sub-agent'),
('refactor', 'architectural', 'DELIVERABLES_CHECK', 'REQUIRED', 'Track all architectural components'),
('refactor', 'architectural', 'HANDOFF_CHAIN', 'REQUIRED', 'Full 3-handoff chain minimum'),
('refactor', 'architectural', 'PRD_REQUIRED', 'REQUIRED', 'Full PRD with ADR required'),
('refactor', 'architectural', 'RETROSPECTIVE', 'REQUIRED', 'Must capture architectural learnings'),
('refactor', 'architectural', 'REGRESSION_VALIDATION', 'REQUIRED', 'REGRESSION-VALIDATOR mandatory')
ON CONFLICT (sd_type, intensity_level, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- ============================================================================
-- HELPER FUNCTION: Get Intensity-Aware Gate Exemption
-- ============================================================================

CREATE OR REPLACE FUNCTION get_intensity_gate_exemption(
  sd_type_param VARCHAR,
  intensity_param VARCHAR,
  gate_name_param VARCHAR
)
RETURNS VARCHAR AS $$
DECLARE
  intensity_exemption VARCHAR;
  base_exemption VARCHAR;
BEGIN
  -- First check for intensity-specific exemption
  IF intensity_param IS NOT NULL THEN
    SELECT exemption_type INTO intensity_exemption
    FROM sd_intensity_gate_exemptions
    WHERE sd_type = sd_type_param
      AND intensity_level = intensity_param
      AND gate_name = gate_name_param;

    IF FOUND THEN
      RETURN intensity_exemption;
    END IF;
  END IF;

  -- Fall back to base sd_type exemption
  SELECT exemption_type INTO base_exemption
  FROM sd_type_gate_exemptions
  WHERE sd_type = COALESCE(sd_type_param, 'feature')
    AND gate_name = gate_name_param;

  -- Default to REQUIRED if no exemption found
  RETURN COALESCE(base_exemption, 'REQUIRED');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_intensity_gate_exemption IS
'Returns gate exemption type considering intensity level. Intensity-specific exemptions override base type exemptions.';

-- ============================================================================
-- HELPER FUNCTION: Get All Gates for SD with Intensity
-- ============================================================================

CREATE OR REPLACE FUNCTION get_sd_gates_with_intensity(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  result JSONB := '{}';
  gate RECORD;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Get all gates with intensity-aware exemptions
  FOR gate IN
    SELECT DISTINCT gate_name
    FROM sd_type_gate_exemptions
    WHERE sd_type = COALESCE(sd.sd_type, 'feature')
  LOOP
    result := result || jsonb_build_object(
      gate.gate_name,
      jsonb_build_object(
        'exemption_type', get_intensity_gate_exemption(sd.sd_type, sd.intensity_level, gate.gate_name),
        'intensity_level', sd.intensity_level,
        'sd_type', sd.sd_type
      )
    );
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_sd_gates_with_intensity IS
'Returns all gate exemptions for an SD, considering its intensity level.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  base_count INT;
  intensity_count INT;
BEGIN
  SELECT COUNT(*) INTO base_count FROM sd_type_gate_exemptions WHERE sd_type = 'refactor';
  SELECT COUNT(*) INTO intensity_count FROM sd_intensity_gate_exemptions WHERE sd_type = 'refactor';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Refactor Gate Exemptions Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Base refactor exemptions: %', base_count;
  RAISE NOTICE 'Intensity-specific exemptions: %', intensity_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Gate behavior by intensity:';
  RAISE NOTICE '';
  RAISE NOTICE '  COSMETIC (lightest):';
  RAISE NOTICE '    PRD_REQUIRED:          SKIP (use Refactor Brief)';
  RAISE NOTICE '    E2E_TESTING:           OPTIONAL';
  RAISE NOTICE '    REGRESSION_VALIDATION: OPTIONAL';
  RAISE NOTICE '    RETROSPECTIVE:         SKIP';
  RAISE NOTICE '';
  RAISE NOTICE '  STRUCTURAL (standard):';
  RAISE NOTICE '    PRD_REQUIRED:          OPTIONAL (Refactor Brief OK)';
  RAISE NOTICE '    E2E_TESTING:           REQUIRED';
  RAISE NOTICE '    REGRESSION_VALIDATION: REQUIRED';
  RAISE NOTICE '    RETROSPECTIVE:         OPTIONAL';
  RAISE NOTICE '';
  RAISE NOTICE '  ARCHITECTURAL (full):';
  RAISE NOTICE '    PRD_REQUIRED:          REQUIRED (full PRD + ADR)';
  RAISE NOTICE '    E2E_TESTING:           REQUIRED';
  RAISE NOTICE '    REGRESSION_VALIDATION: REQUIRED';
  RAISE NOTICE '    RETROSPECTIVE:         REQUIRED';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT get_intensity_gate_exemption(''refactor'', ''cosmetic'', ''PRD_REQUIRED'');';
  RAISE NOTICE '  SELECT get_sd_gates_with_intensity(''SD-XXX'');';
  RAISE NOTICE '============================================================';
END $$;
