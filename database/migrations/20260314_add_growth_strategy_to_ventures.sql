-- Migration: Add growth_strategy column to ventures table
-- SD: SD-LEO-FEAT-PORTFOLIO-BALANCE-SYSTEM-001
-- Purpose: Enable portfolio-level strategy classification (Cash Engine, Capability Builder, Moonshot)

-- Step 1: Create enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'growth_strategy_type') THEN
    CREATE TYPE growth_strategy_type AS ENUM ('cash_engine', 'capability_builder', 'moonshot');
  END IF;
END$$;

-- Step 2: Add column (nullable - backward compatible)
ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS growth_strategy growth_strategy_type;

-- Step 3: Index for portfolio balance queries
CREATE INDEX IF NOT EXISTS idx_ventures_growth_strategy
  ON ventures (growth_strategy)
  WHERE status = 'active' AND deleted_at IS NULL;

-- Step 4: Column documentation
COMMENT ON COLUMN ventures.growth_strategy IS
  'Portfolio growth strategy classification: cash_engine (proven revenue), capability_builder (reusable tech/business capabilities), moonshot (high risk/high ceiling)';
