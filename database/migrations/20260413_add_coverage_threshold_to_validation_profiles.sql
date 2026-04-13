-- Migration: Add configurable coverage thresholds to sd_type_validation_profiles
-- SD: SD-LEO-INFRA-SEVERITY-AWARE-TESTING-001
-- Board: 6/6 consensus on CTO schema approach + COO phasing + CISO security floor
-- Vision: VISION-SEVERITY-TESTING-GOVERNANCE-L2-001
-- Architecture: ARCH-SEVERITY-TESTING-GOVERNANCE-001

-- Phase 1: Per-type configurable thresholds

-- Add coverage threshold column (nullable = fallback to existing 60/40 logic)
ALTER TABLE sd_type_validation_profiles
  ADD COLUMN IF NOT EXISTS coverage_threshold_pct INTEGER DEFAULT NULL;

-- Add blocking flag (controls whether threshold failure blocks or is advisory)
ALTER TABLE sd_type_validation_profiles
  ADD COLUMN IF NOT EXISTS coverage_blocking BOOLEAN DEFAULT TRUE;

-- CISO non-negotiable: security_hotfix hardcoded at 100% via DB constraint
-- This cannot be bypassed by application code
ALTER TABLE sd_type_validation_profiles
  DROP CONSTRAINT IF EXISTS security_floor;

ALTER TABLE sd_type_validation_profiles
  ADD CONSTRAINT security_floor
  CHECK (NOT (sd_type = 'security' AND coverage_threshold_pct IS NOT NULL AND coverage_threshold_pct < 100));

-- Seed Phase 1 thresholds (COO phasing: LOW/MED tiers only)
-- feature/bugfix: 85% (up from hardcoded 60%)
UPDATE sd_type_validation_profiles SET coverage_threshold_pct = 85, coverage_blocking = TRUE
  WHERE sd_type IN ('feature', 'bugfix');

-- infrastructure/refactor: 70% (up from hardcoded 40%)
UPDATE sd_type_validation_profiles SET coverage_threshold_pct = 70, coverage_blocking = FALSE
  WHERE sd_type IN ('infrastructure', 'refactor');

-- security: 100% (CISO floor — enforced by CHECK constraint)
UPDATE sd_type_validation_profiles SET coverage_threshold_pct = 100, coverage_blocking = TRUE
  WHERE sd_type = 'security';

-- documentation: 50% (advisory only)
UPDATE sd_type_validation_profiles SET coverage_threshold_pct = 50, coverage_blocking = FALSE
  WHERE sd_type = 'documentation';

-- Comment for future phases
COMMENT ON COLUMN sd_type_validation_profiles.coverage_threshold_pct IS
  'Test pass rate threshold (0-100). NULL = fallback to system default (60/40). Phase 2 will add severity-based overrides.';

COMMENT ON COLUMN sd_type_validation_profiles.coverage_blocking IS
  'Whether failing the threshold blocks the handoff (TRUE) or is advisory only (FALSE).';
