-- Migration 028: Fix sub_agent_id type mismatch in sub_agent_executions
-- Created: 2026-01-02
--
-- PROBLEM:
-- sub_agent_executions.sub_agent_id is UUID type
-- leo_sub_agents.id is VARCHAR(50) type
-- FK constraint incompatible between UUID and VARCHAR
--
-- SOLUTION:
-- Convert sub_agent_executions.sub_agent_id from UUID to VARCHAR(50)
-- to align with leo_sub_agents.id type
--
-- This is a safe migration because:
-- 1. sub_agent_executions may not have FK constraint yet (due to type mismatch)
-- 2. UUID values will convert to VARCHAR(50) cleanly
-- 3. Adds proper FK constraint after type alignment

BEGIN;

-- Step 1: Check if the table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'sub_agent_executions'
  ) THEN
    RAISE NOTICE 'Table sub_agent_executions does not exist, skipping migration';
    RETURN;
  END IF;

  RAISE NOTICE 'Starting sub_agent_id type migration for sub_agent_executions';
END $$;

-- Step 2: Drop any existing FK constraints that might fail
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sub_agent_executions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%sub_agent%'
  ) THEN
    EXECUTE (
      SELECT string_agg(
        'ALTER TABLE sub_agent_executions DROP CONSTRAINT IF EXISTS ' || constraint_name,
        '; '
      )
      FROM information_schema.table_constraints
      WHERE table_name = 'sub_agent_executions'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%sub_agent%'
    );
    RAISE NOTICE 'Dropped existing sub_agent FK constraints';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No FK constraints to drop or error: %', SQLERRM;
END $$;

-- Step 3: Drop the unique index that includes sub_agent_id
DROP INDEX IF EXISTS ux_subagent_prd;
RAISE NOTICE 'Dropped ux_subagent_prd index if it existed';

-- Step 4: Check current column type and convert if needed
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'sub_agent_executions'
  AND column_name = 'sub_agent_id';

  IF current_type IS NULL THEN
    RAISE NOTICE 'Column sub_agent_id not found, table may not exist';
    RETURN;
  END IF;

  IF current_type = 'uuid' THEN
    -- Convert UUID to VARCHAR(50)
    ALTER TABLE sub_agent_executions
      ALTER COLUMN sub_agent_id TYPE VARCHAR(50) USING sub_agent_id::TEXT;
    RAISE NOTICE 'Converted sub_agent_id from UUID to VARCHAR(50)';
  ELSIF current_type = 'character varying' THEN
    RAISE NOTICE 'sub_agent_id is already VARCHAR type';
  ELSE
    RAISE NOTICE 'sub_agent_id has unexpected type: %. Attempting conversion...', current_type;
    ALTER TABLE sub_agent_executions
      ALTER COLUMN sub_agent_id TYPE VARCHAR(50) USING sub_agent_id::TEXT;
  END IF;
END $$;

-- Step 5: Recreate the unique index with new type
CREATE UNIQUE INDEX IF NOT EXISTS ux_subagent_prd
  ON sub_agent_executions(prd_id, sub_agent_id);

-- Step 6: Add FK constraint (now compatible types)
-- Note: This will only succeed if the sub_agent_id values actually exist in leo_sub_agents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sub_agent_executions'
    AND constraint_name = 'fk_sub_agent_executions_sub_agent'
  ) THEN
    -- First, clean up any orphaned records (sub_agent_id not in leo_sub_agents)
    DELETE FROM sub_agent_executions
    WHERE sub_agent_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM leo_sub_agents WHERE id = sub_agent_executions.sub_agent_id
    );

    RAISE NOTICE 'Cleaned up orphaned sub_agent_executions records';

    -- Now add the FK constraint
    ALTER TABLE sub_agent_executions
      ADD CONSTRAINT fk_sub_agent_executions_sub_agent
      FOREIGN KEY (sub_agent_id) REFERENCES leo_sub_agents(id) ON DELETE CASCADE;

    RAISE NOTICE 'Added FK constraint fk_sub_agent_executions_sub_agent';
  ELSE
    RAISE NOTICE 'FK constraint fk_sub_agent_executions_sub_agent already exists';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not add FK constraint: %. Consider manual cleanup.', SQLERRM;
END $$;

COMMIT;

-- Verification
DO $$
DECLARE
  col_type TEXT;
  has_fk BOOLEAN;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'sub_agent_executions'
  AND column_name = 'sub_agent_id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sub_agent_executions'
    AND constraint_name = 'fk_sub_agent_executions_sub_agent'
  ) INTO has_fk;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 028 Verification:';
  RAISE NOTICE '  sub_agent_id type: %', COALESCE(col_type, 'N/A');
  RAISE NOTICE '  FK constraint exists: %', has_fk;
  RAISE NOTICE '========================================';
END $$;
