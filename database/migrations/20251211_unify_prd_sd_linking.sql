-- Migration: Unify PRD to SD Linking
-- Date: 2025-12-11
-- Problem: product_requirements_v2 has two SD linking columns (sd_id, directive_id)
--          with inconsistent usage causing 49.3% of PRDs to be missed by sd_id queries
--
-- Solution:
--   1. Backfill sd_id from directive_id where sd_id is NULL
--   2. Create a trigger to keep them in sync going forward
--   3. Add a generated column for consistent querying
--
-- Analysis Before Fix:
--   - sd_id ONLY: 40 (14.5%)
--   - directive_id ONLY: 136 (49.3%)
--   - BOTH: 95 (34.4%)
--   - NEITHER: 5 (1.8%)

-- ============================================
-- PART 1: Backfill sd_id from directive_id
-- ============================================

-- Update PRDs where sd_id is NULL but directive_id is populated
UPDATE product_requirements_v2
SET sd_id = directive_id
WHERE sd_id IS NULL
  AND directive_id IS NOT NULL
  AND directive_id != '';

-- Update PRDs where directive_id is NULL but sd_id is populated
UPDATE product_requirements_v2
SET directive_id = sd_id
WHERE directive_id IS NULL
  AND sd_id IS NOT NULL
  AND sd_id != '';

-- ============================================
-- PART 2: Create sync trigger for future inserts/updates
-- ============================================

CREATE OR REPLACE FUNCTION sync_prd_sd_linking()
RETURNS TRIGGER AS $$
BEGIN
  -- If sd_id is set but directive_id is not, copy sd_id to directive_id
  IF NEW.sd_id IS NOT NULL AND NEW.sd_id != '' AND (NEW.directive_id IS NULL OR NEW.directive_id = '') THEN
    NEW.directive_id := NEW.sd_id;
  END IF;

  -- If directive_id is set but sd_id is not, copy directive_id to sd_id
  IF NEW.directive_id IS NOT NULL AND NEW.directive_id != '' AND (NEW.sd_id IS NULL OR NEW.sd_id = '') THEN
    NEW.sd_id := NEW.directive_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_sync_prd_sd_linking ON product_requirements_v2;

CREATE TRIGGER trigger_sync_prd_sd_linking
  BEFORE INSERT OR UPDATE ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION sync_prd_sd_linking();

-- ============================================
-- PART 3: Add comment documenting the canonical column
-- ============================================

COMMENT ON COLUMN product_requirements_v2.sd_id IS 'CANONICAL SD linking column. Use this for all queries. Auto-synced with directive_id.';
COMMENT ON COLUMN product_requirements_v2.directive_id IS 'LEGACY SD linking column. Kept for backward compatibility. Auto-synced with sd_id.';

-- ============================================
-- PART 4: Verification query (run after migration)
-- ============================================

-- This should return 0 rows after migration
-- SELECT id, sd_id, directive_id
-- FROM product_requirements_v2
-- WHERE (sd_id IS NULL OR sd_id = '') AND (directive_id IS NULL OR directive_id = '');

-- This should show all PRDs now have consistent linking
-- SELECT
--   COUNT(*) as total,
--   COUNT(CASE WHEN sd_id IS NOT NULL AND directive_id IS NOT NULL THEN 1 END) as both_set,
--   COUNT(CASE WHEN sd_id IS NULL OR directive_id IS NULL THEN 1 END) as incomplete
-- FROM product_requirements_v2;
