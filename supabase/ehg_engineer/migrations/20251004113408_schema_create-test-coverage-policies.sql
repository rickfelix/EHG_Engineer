-- ================================================================
-- Test Coverage Policy Table
-- ================================================================
-- Purpose: Store LOC-based test coverage requirements
-- SD: SD-QUALITY-002
-- PRD: PRD-99e35b97-e370-459f-96e2-373176210254
-- ================================================================

BEGIN;

-- Create test_coverage_policies table
CREATE TABLE IF NOT EXISTS test_coverage_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name VARCHAR(50) NOT NULL UNIQUE,
  loc_min INTEGER NOT NULL,
  loc_max INTEGER NOT NULL,
  requirement_level VARCHAR(20) NOT NULL CHECK (requirement_level IN ('OPTIONAL', 'RECOMMENDED', 'REQUIRED')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient LOC range lookups
CREATE INDEX IF NOT EXISTS idx_test_coverage_loc_range
ON test_coverage_policies(loc_min, loc_max);

-- Add comments
COMMENT ON TABLE test_coverage_policies IS
  'LOC-based test coverage policy enforcement for QA sub-agent. SD-QUALITY-002.';

COMMENT ON COLUMN test_coverage_policies.tier_name IS
  'Human-readable tier name (e.g., "Tier 1: Minimal Files")';

COMMENT ON COLUMN test_coverage_policies.loc_min IS
  'Minimum lines of code (inclusive) for this tier';

COMMENT ON COLUMN test_coverage_policies.loc_max IS
  'Maximum lines of code (inclusive) for this tier';

COMMENT ON COLUMN test_coverage_policies.requirement_level IS
  'OPTIONAL = tests nice-to-have, RECOMMENDED = tests encouraged, REQUIRED = tests mandatory';

-- Populate initial 3 tiers
INSERT INTO test_coverage_policies (tier_name, loc_min, loc_max, requirement_level, description) VALUES
  (
    'Tier 1: Minimal Files',
    0,
    19,
    'OPTIONAL',
    'Files under 20 LOC are typically simple utilities or configs. Test coverage is optional but encouraged for complex logic.'
  ),
  (
    'Tier 2: Standard Files',
    20,
    50,
    'RECOMMENDED',
    'Files between 20-50 LOC contain moderate complexity. Test coverage is strongly recommended to ensure reliability.'
  ),
  (
    'Tier 3: Complex Files',
    51,
    999999,
    'REQUIRED',
    'Files over 50 LOC have significant complexity. Test coverage is REQUIRED to maintain code quality and prevent regressions.'
  )
ON CONFLICT (tier_name) DO NOTHING;

-- Verify data
DO $$
DECLARE
  tier_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tier_count FROM test_coverage_policies;

  IF tier_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 policy tiers, found %', tier_count;
  END IF;

  RAISE NOTICE '✓ 3 policy tiers created successfully';
END $$;

COMMIT;

-- ===============================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ===============================================================

-- View all policies
-- SELECT * FROM test_coverage_policies ORDER BY loc_min;

-- Test LOC range lookup (example: 35 LOC file)
-- SELECT tier_name, requirement_level, description
-- FROM test_coverage_policies
-- WHERE 35 BETWEEN loc_min AND loc_max;

-- ===============================================================
-- ROLLBACK INSTRUCTIONS
-- ===============================================================
-- If migration fails:
-- 1. Transaction will auto-rollback
-- 2. No data changes

-- If need to manually rollback after commit:
-- DROP TABLE test_coverage_policies;
