-- LEO Protocol Enhancement: Refactoring Intensity Levels
-- Purpose: Add intensity-aware validation for refactoring SDs
-- Problem Solved: All refactoring treated the same - cosmetic renames and major restructures had identical requirements
-- Date: 2025-12-27

-- ============================================================================
-- ADD INTENSITY_LEVEL COLUMN TO STRATEGIC_DIRECTIVES_V2
-- ============================================================================

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS intensity_level VARCHAR(20)
CHECK (intensity_level IN ('cosmetic', 'structural', 'architectural'));

COMMENT ON COLUMN strategic_directives_v2.intensity_level IS
'Refactoring intensity level. Required for sd_type=refactor. Values:
  - cosmetic: Variable renames, formatting, comment updates (<50 LOC)
  - structural: Extract methods, file reorganization, import changes (50-500 LOC)
  - architectural: Design pattern changes, module restructuring (>500 LOC)';

CREATE INDEX IF NOT EXISTS idx_sd_v2_intensity_level
ON strategic_directives_v2(intensity_level)
WHERE intensity_level IS NOT NULL;

-- ============================================================================
-- CREATE INTENSITY ADJUSTMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_intensity_adjustments (
  id SERIAL PRIMARY KEY,
  sd_type VARCHAR(50) NOT NULL,
  intensity_level VARCHAR(20) NOT NULL CHECK (intensity_level IN ('cosmetic', 'structural', 'architectural')),

  -- Requirement overrides (NULL = use profile default from sd_type_validation_profiles)
  requires_prd_override BOOLEAN,
  requires_e2e_override BOOLEAN,
  requires_retrospective_override BOOLEAN,
  min_handoffs_override INT CHECK (min_handoffs_override IS NULL OR (min_handoffs_override >= 1 AND min_handoffs_override <= 5)),

  -- Phase weight adjustments (added to base profile weights)
  lead_weight_adj INT DEFAULT 0 CHECK (lead_weight_adj >= -20 AND lead_weight_adj <= 20),
  plan_weight_adj INT DEFAULT 0 CHECK (plan_weight_adj >= -20 AND plan_weight_adj <= 20),
  exec_weight_adj INT DEFAULT 0 CHECK (exec_weight_adj >= -20 AND exec_weight_adj <= 20),
  verify_weight_adj INT DEFAULT 0 CHECK (verify_weight_adj >= -20 AND verify_weight_adj <= 20),
  final_weight_adj INT DEFAULT 0 CHECK (final_weight_adj >= -20 AND final_weight_adj <= 20),

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sd_type, intensity_level),

  -- Ensure adjustments sum to zero (don't break 100% total)
  CONSTRAINT adjustments_sum_to_zero CHECK (
    lead_weight_adj + plan_weight_adj + exec_weight_adj + verify_weight_adj + final_weight_adj = 0
  )
);

COMMENT ON TABLE sd_intensity_adjustments IS
'Adjustments to validation requirements based on intensity level.
Overrides take precedence over sd_type_validation_profiles defaults.
Weight adjustments are ADDED to base weights (must sum to 0 to maintain 100% total).';

-- ============================================================================
-- INSERT REFACTOR INTENSITY ADJUSTMENTS
-- ============================================================================

INSERT INTO sd_intensity_adjustments (
  sd_type, intensity_level,
  requires_prd_override, requires_e2e_override, requires_retrospective_override, min_handoffs_override,
  lead_weight_adj, plan_weight_adj, exec_weight_adj, verify_weight_adj, final_weight_adj,
  description
) VALUES
-- Cosmetic: Lightest requirements - Refactor Brief instead of PRD, skip E2E
('refactor', 'cosmetic',
 false, false, false, 1,
 5, -5, 0, 0, 0,
 'Cosmetic refactoring: variable renames, formatting, comment updates. No PRD required (use Refactor Brief). Single handoff allowed. Focus on LEAD approval.'),

-- Structural: Standard requirements - Refactor Brief + E2E
('refactor', 'structural',
 true, true, false, 2,
 0, 0, 0, 0, 0,
 'Structural refactoring: extract methods, file reorganization, import changes. Requires Refactor Brief and E2E tests. Standard 2-handoff chain.'),

-- Architectural: Enhanced requirements - Full PRD + REGRESSION + Retrospective
('refactor', 'architectural',
 true, true, true, 3,
 -5, 5, 0, 5, -5,
 'Architectural refactoring: design pattern changes, module restructuring. Full PRD required. REGRESSION-VALIDATOR mandatory. Retrospective required for learning capture.')

ON CONFLICT (sd_type, intensity_level) DO UPDATE SET
  requires_prd_override = EXCLUDED.requires_prd_override,
  requires_e2e_override = EXCLUDED.requires_e2e_override,
  requires_retrospective_override = EXCLUDED.requires_retrospective_override,
  min_handoffs_override = EXCLUDED.min_handoffs_override,
  lead_weight_adj = EXCLUDED.lead_weight_adj,
  plan_weight_adj = EXCLUDED.plan_weight_adj,
  exec_weight_adj = EXCLUDED.exec_weight_adj,
  verify_weight_adj = EXCLUDED.verify_weight_adj,
  final_weight_adj = EXCLUDED.final_weight_adj,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- HELPER FUNCTION: Get Intensity-Adjusted Profile
-- ============================================================================

CREATE OR REPLACE FUNCTION get_intensity_adjusted_profile(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  base_profile RECORD;
  intensity_adj RECORD;
  result JSONB;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Get base profile
  SELECT * INTO base_profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  IF NOT FOUND THEN
    SELECT * INTO base_profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check for intensity adjustment
  IF sd.intensity_level IS NOT NULL THEN
    SELECT * INTO intensity_adj
    FROM sd_intensity_adjustments
    WHERE sd_type = sd.sd_type AND intensity_level = sd.intensity_level;
  END IF;

  -- Build result with adjustments applied
  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd.sd_type,
    'intensity_level', sd.intensity_level,
    'base_profile', base_profile.sd_type,
    'weights', jsonb_build_object(
      'lead', base_profile.lead_weight + COALESCE(intensity_adj.lead_weight_adj, 0),
      'plan', base_profile.plan_weight + COALESCE(intensity_adj.plan_weight_adj, 0),
      'exec', base_profile.exec_weight + COALESCE(intensity_adj.exec_weight_adj, 0),
      'verify', base_profile.verify_weight + COALESCE(intensity_adj.verify_weight_adj, 0),
      'final', base_profile.final_weight + COALESCE(intensity_adj.final_weight_adj, 0)
    ),
    'requirements', jsonb_build_object(
      'prd', COALESCE(intensity_adj.requires_prd_override, base_profile.requires_prd),
      'e2e_tests', COALESCE(intensity_adj.requires_e2e_override, base_profile.requires_e2e_tests),
      'retrospective', COALESCE(intensity_adj.requires_retrospective_override, base_profile.requires_retrospective),
      'min_handoffs', COALESCE(intensity_adj.min_handoffs_override, base_profile.min_handoffs),
      'deliverables', base_profile.requires_deliverables,
      'sub_agents', base_profile.requires_sub_agents
    ),
    'intensity_adjustment_applied', intensity_adj.id IS NOT NULL,
    'intensity_description', intensity_adj.description
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_intensity_adjusted_profile IS
'Returns the effective validation profile for an SD, with intensity adjustments applied if applicable.';

-- ============================================================================
-- HELPER FUNCTION: Check Intensity Required
-- ============================================================================

CREATE OR REPLACE FUNCTION check_intensity_required()
RETURNS TRIGGER AS $$
BEGIN
  -- If sd_type is 'refactor' and status is being set to active/in_progress
  -- intensity_level must be set
  IF NEW.sd_type = 'refactor'
     AND NEW.status IN ('active', 'in_progress', 'pending_approval')
     AND NEW.intensity_level IS NULL THEN
    RAISE EXCEPTION 'LEO Protocol Violation: Refactoring SDs require intensity_level to be set.

SD: %
Status: %

REQUIRED: Set intensity_level before activating:
  - cosmetic: Variable renames, formatting (<50 LOC)
  - structural: Extract methods, file reorg (50-500 LOC)
  - architectural: Design patterns, module changes (>500 LOC)

SQL: UPDATE strategic_directives_v2 SET intensity_level = ''structural'' WHERE id = ''%'';',
      NEW.id, NEW.status, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS tr_check_intensity_required ON strategic_directives_v2;
CREATE TRIGGER tr_check_intensity_required
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION check_intensity_required();

COMMENT ON FUNCTION check_intensity_required IS
'Trigger function that enforces intensity_level is set for refactoring SDs before activation.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  adjustment_count INT;
BEGIN
  SELECT COUNT(*) INTO adjustment_count FROM sd_intensity_adjustments;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Refactoring Intensity Levels Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Intensity adjustments created: %', adjustment_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New column: strategic_directives_v2.intensity_level';
  RAISE NOTICE '';
  RAISE NOTICE 'Intensity levels for refactoring SDs:';
  RAISE NOTICE '  cosmetic:      Renames, formatting. No PRD, 1 handoff.';
  RAISE NOTICE '  structural:    Extract/consolidate. Refactor Brief + E2E.';
  RAISE NOTICE '  architectural: Pattern changes. Full PRD + REGRESSION.';
  RAISE NOTICE '';
  RAISE NOTICE 'REQUIRED: LEAD must set intensity_level before activating refactor SDs';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  -- Set intensity during LEAD approval:';
  RAISE NOTICE '  UPDATE strategic_directives_v2 SET intensity_level = ''structural'' WHERE id = ''SD-XXX'';';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Check effective profile:';
  RAISE NOTICE '  SELECT get_intensity_adjusted_profile(''SD-XXX'');';
  RAISE NOTICE '============================================================';
END $$;
