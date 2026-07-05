-- Migration: Add not_before to quick_fixes table
-- Purpose: Durable time-gated defer mechanism. When set, a quick-fix is not
--          eligible for claim/processing until NOW() >= not_before. Lets the
--          belt/coordinator snooze a QF without losing it (survives restarts,
--          unlike an in-memory defer flag).
-- Created: 2026-07-05
-- Related: SD-LEO-FIX-QUICK-FIXES-NEEDS-001

BEGIN;

-- Add durable defer-until timestamp (NULL = no defer, immediately eligible)
ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS not_before TIMESTAMPTZ;

-- Comment for documentation
COMMENT ON COLUMN quick_fixes.not_before IS
  'Durable time-gated defer: when set, the quick-fix is not eligible for claim
   until NOW() >= not_before. NULL (default) means no defer / immediately
   eligible. Added an additional WHERE predicate (e.g. not_before IS NULL OR
   not_before <= NOW()) to claim queries; not an ORDER BY key, so no index.';

COMMIT;

-- Rollback:
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS not_before;
