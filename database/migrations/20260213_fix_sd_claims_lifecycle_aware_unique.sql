-- Quick-Fix QF-20260213-620: Fix sd_claims unique constraint to be lifecycle-aware
-- Root cause: sd_claims_sd_session_unique enforces UNIQUE(sd_id, session_id) across ALL rows,
-- including released claims. Released rows block re-claims for the same (sd_id, session_id) pair.
-- Fix: Replace with partial unique index on (sd_id) WHERE released_at IS NULL.

-- Step 1: Clean up duplicate active claims before creating the new unique index
-- (71 orphaned claims from stale sessions, 12 SDs with duplicate active claims)
UPDATE sd_claims
SET released_at = NOW(), release_reason = 'STALE_CLEANUP'
WHERE released_at IS NULL
  AND session_id NOT IN (
    SELECT session_id FROM claude_sessions
    WHERE status IN ('active', 'idle')
  );

-- Step 2: For remaining duplicates (multiple active sessions claiming same SD),
-- keep only the most recent claim per SD
WITH ranked AS (
  SELECT id, sd_id, ROW_NUMBER() OVER (PARTITION BY sd_id ORDER BY claimed_at DESC) as rn
  FROM sd_claims
  WHERE released_at IS NULL
)
UPDATE sd_claims
SET released_at = NOW(), release_reason = 'conflict'
FROM ranked
WHERE sd_claims.id = ranked.id AND ranked.rn > 1;

-- Step 3: Drop the lifecycle-unaware unique constraint
ALTER TABLE sd_claims DROP CONSTRAINT IF EXISTS sd_claims_sd_session_unique;

-- Step 4: Drop the old non-unique active index (superseded by new unique index)
DROP INDEX IF EXISTS idx_sd_claims_active;

-- Step 5: Create the lifecycle-aware partial unique index
-- Only ONE active (unreleased) claim per SD at any time
CREATE UNIQUE INDEX sd_claims_active_unique
  ON sd_claims (sd_id)
  WHERE released_at IS NULL;

-- Verification
DO $$
DECLARE
  v_old_exists BOOLEAN;
  v_new_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sd_claims_sd_session_unique')
    INTO v_old_exists;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'sd_claims_active_unique')
    INTO v_new_exists;

  IF v_old_exists THEN
    RAISE WARNING 'FAILED: Old constraint sd_claims_sd_session_unique still exists';
  ELSE
    RAISE NOTICE 'SUCCESS: Old constraint removed';
  END IF;

  IF v_new_exists THEN
    RAISE NOTICE 'SUCCESS: New partial unique index sd_claims_active_unique created';
  ELSE
    RAISE WARNING 'FAILED: New index not created';
  END IF;
END $$;
