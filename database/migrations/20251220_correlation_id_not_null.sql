-- Migration: Add NOT NULL constraint to system_events.correlation_id
-- Date: 2025-12-20
-- Context: SD-HARDENING-V2-002C - Idempotency and persistence hardening
-- Related: system_events.idempotency_key already has NOT NULL constraint

-- Purpose:
-- 1. Backfill any NULL correlation_ids with generated UUIDs
-- 2. Add NOT NULL constraint to enforce correlation_id presence
-- 3. Ensure all events can be correlated for debugging and audit trails

BEGIN;

-- Step 1: Check current state (for logging/verification)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM system_events
  WHERE correlation_id IS NULL;

  RAISE NOTICE 'Found % rows with NULL correlation_id', null_count;
END $$;

-- Step 2: Backfill NULL correlation_ids with generated UUIDs
-- This ensures existing data won't violate the NOT NULL constraint
UPDATE system_events
SET correlation_id = gen_random_uuid()
WHERE correlation_id IS NULL;

-- Step 3: Add NOT NULL constraint
ALTER TABLE system_events
ALTER COLUMN correlation_id SET NOT NULL;

-- Step 4: Verify the change
DO $$
DECLARE
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM system_events
  WHERE correlation_id IS NULL;

  SELECT COUNT(*) INTO total_count
  FROM system_events;

  RAISE NOTICE 'Verification: % total rows, % NULL correlation_ids', total_count, null_count;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: Still have % NULL correlation_ids', null_count;
  END IF;

  RAISE NOTICE 'SUCCESS: correlation_id is now NOT NULL on all % rows', total_count;
END $$;

-- Step 5: Verify constraint was added
SELECT
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'system_events'
  AND column_name = 'correlation_id';

COMMIT;

-- Expected output:
-- NOTICE: Found X rows with NULL correlation_id
-- NOTICE: Verification: Y total rows, 0 NULL correlation_ids
-- NOTICE: SUCCESS: correlation_id is now NOT NULL on all Y rows
--
-- Query result should show:
-- table_name    | column_name    | is_nullable | data_type
-- system_events | correlation_id | NO          | uuid
