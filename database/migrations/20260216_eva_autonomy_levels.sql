-- Migration: Add autonomy_level to eva_ventures
-- Date: 2026-02-16
-- Description: Creates eva_autonomy_level enum type and adds autonomy_level column
--              to eva_ventures table for EVA autonomy classification (L0-L4).

-- Step 1: Create enum type (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eva_autonomy_level') THEN
    CREATE TYPE eva_autonomy_level AS ENUM ('L0', 'L1', 'L2', 'L3', 'L4');
  END IF;
END
$$;

-- Step 2: Add column if not exists
ALTER TABLE eva_ventures
  ADD COLUMN IF NOT EXISTS autonomy_level eva_autonomy_level NOT NULL DEFAULT 'L0';

-- Step 3: Add comment
COMMENT ON COLUMN eva_ventures.autonomy_level IS 'EVA autonomy level: L0=Manual, L1=Assisted, L2=Partial, L3=Conditional, L4=Full';

-- Rollback:
-- ALTER TABLE eva_ventures DROP COLUMN IF EXISTS autonomy_level;
-- DROP TYPE IF EXISTS eva_autonomy_level;
