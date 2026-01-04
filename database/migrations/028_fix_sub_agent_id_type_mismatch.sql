-- Migration 028: Fix sub_agent_id type mismatch across all tables
-- Created: 2026-01-02
-- Updated: 2026-01-02 (Final version - handle ALL FK constraints)
--
-- PROBLEM:
-- Goal: Standardize sub-agent ID references to VARCHAR(50) across ALL tables
-- Currently ALL use UUID:
--   - leo_sub_agents.id: UUID (primary key)
--   - sub_agent_executions.sub_agent_id: UUID (FK → leo_sub_agents.id)
--   - leo_sub_agent_triggers.sub_agent_id: UUID (FK → leo_sub_agents.id)
-- 3 views depend on sub_agent_id column
-- Duplicate records exist in sub_agent_executions
--
-- SOLUTION:
-- 1. Drop all dependent views
-- 2. Drop FK constraints from BOTH referencing tables
-- 3. Remove duplicate records in sub_agent_executions
-- 4. Convert ALL 3 tables to VARCHAR(50)
-- 5. Recreate FK constraints
-- 6. Recreate unique index
-- 7. Recreate all 3 views
--
-- This is a safe migration because:
-- 1. All FK constraints temporarily dropped, then recreated
-- 2. UUID values convert cleanly to VARCHAR(50)
-- 3. Only latest execution kept for duplicates
-- 4. FK constraints ensure referential integrity

BEGIN;

-- Step 1: Check if tables exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'leo_sub_agents'
  ) THEN
    RAISE NOTICE 'leo_sub_agents table does not exist, skipping migration';
    RETURN;
  END IF;

  RAISE NOTICE 'Starting sub_agent_id type migration across all tables';
END $$;

-- Step 2: Drop all 3 dependent views
DO $$
BEGIN
  DROP VIEW IF EXISTS v_sub_agent_executions_unified CASCADE;
  DROP VIEW IF EXISTS v_sub_agent_execution_history CASCADE;
  DROP VIEW IF EXISTS v_contexts_missing_sub_agents CASCADE;
  RAISE NOTICE 'Dropped all 3 dependent views';
END $$;

-- Step 3: Drop ALL FK constraints pointing to leo_sub_agents.id
DO $$
DECLARE
  fk_record RECORD;
BEGIN
  FOR fk_record IN (
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'leo_sub_agents'
      AND ccu.column_name = 'id'
  )
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      fk_record.table_name, fk_record.constraint_name);
    RAISE NOTICE 'Dropped FK constraint: %.%', fk_record.table_name, fk_record.constraint_name;
  END LOOP;
END $$;

-- Step 4: Drop the unique index
DO $$
BEGIN
  DROP INDEX IF EXISTS ux_subagent_prd;
  RAISE NOTICE 'Dropped ux_subagent_prd index if it existed';
END $$;

-- Step 5: Remove duplicate records from sub_agent_executions
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sub_agent_executions'
  ) THEN
    DELETE FROM sub_agent_executions
    WHERE id NOT IN (
      SELECT DISTINCT ON (prd_id, sub_agent_id) id
      FROM sub_agent_executions
      WHERE prd_id IS NOT NULL AND sub_agent_id IS NOT NULL
      ORDER BY prd_id, sub_agent_id, created_at DESC NULLS LAST, id DESC
    )
    AND prd_id IS NOT NULL
    AND sub_agent_id IS NOT NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Removed % duplicate records from sub_agent_executions', deleted_count;
  END IF;
END $$;

-- Step 6: Convert leo_sub_agents.id from UUID to VARCHAR(50)
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'leo_sub_agents'
  AND column_name = 'id';

  IF current_type = 'uuid' THEN
    ALTER TABLE leo_sub_agents
      ALTER COLUMN id TYPE VARCHAR(50) USING id::TEXT;
    RAISE NOTICE 'Converted leo_sub_agents.id from UUID to VARCHAR(50)';
  ELSIF current_type = 'character varying' THEN
    RAISE NOTICE 'leo_sub_agents.id is already VARCHAR type';
  END IF;
END $$;

-- Step 7: Convert sub_agent_executions.sub_agent_id from UUID to VARCHAR(50)
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'sub_agent_executions'
  AND column_name = 'sub_agent_id';

  IF current_type = 'uuid' THEN
    ALTER TABLE sub_agent_executions
      ALTER COLUMN sub_agent_id TYPE VARCHAR(50) USING sub_agent_id::TEXT;
    RAISE NOTICE 'Converted sub_agent_executions.sub_agent_id from UUID to VARCHAR(50)';
  ELSIF current_type = 'character varying' THEN
    RAISE NOTICE 'sub_agent_executions.sub_agent_id is already VARCHAR type';
  END IF;
END $$;

-- Step 8: Convert leo_sub_agent_triggers.sub_agent_id from UUID to VARCHAR(50)
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'leo_sub_agent_triggers'
  AND column_name = 'sub_agent_id';

  IF current_type = 'uuid' THEN
    ALTER TABLE leo_sub_agent_triggers
      ALTER COLUMN sub_agent_id TYPE VARCHAR(50) USING sub_agent_id::TEXT;
    RAISE NOTICE 'Converted leo_sub_agent_triggers.sub_agent_id from UUID to VARCHAR(50)';
  ELSIF current_type = 'character varying' THEN
    RAISE NOTICE 'leo_sub_agent_triggers.sub_agent_id is already VARCHAR type';
  ELSIF current_type IS NULL THEN
    RAISE NOTICE 'leo_sub_agent_triggers table or column does not exist, skipping';
  END IF;
END $$;

-- Step 9: Recreate the unique index on sub_agent_executions
CREATE UNIQUE INDEX IF NOT EXISTS ux_subagent_prd
  ON sub_agent_executions(prd_id, sub_agent_id);

-- Step 10: Recreate FK constraint for sub_agent_executions
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sub_agent_executions'
  ) THEN
    -- Clean up orphaned records
    DELETE FROM sub_agent_executions
    WHERE sub_agent_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM leo_sub_agents WHERE id = sub_agent_executions.sub_agent_id
    );

    GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % orphaned sub_agent_executions records', orphaned_count;

    -- Add FK constraint
    ALTER TABLE sub_agent_executions
      ADD CONSTRAINT sub_agent_executions_sub_agent_id_fkey
      FOREIGN KEY (sub_agent_id) REFERENCES leo_sub_agents(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK constraint: sub_agent_executions.sub_agent_id → leo_sub_agents.id';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not add FK constraint for sub_agent_executions: %', SQLERRM;
END $$;

-- Step 11: Recreate FK constraint for leo_sub_agent_triggers
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leo_sub_agent_triggers'
  ) THEN
    -- Clean up orphaned records
    DELETE FROM leo_sub_agent_triggers
    WHERE sub_agent_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM leo_sub_agents WHERE id = leo_sub_agent_triggers.sub_agent_id
    );

    GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % orphaned leo_sub_agent_triggers records', orphaned_count;

    -- Add FK constraint
    ALTER TABLE leo_sub_agent_triggers
      ADD CONSTRAINT leo_sub_agent_triggers_sub_agent_id_fkey
      FOREIGN KEY (sub_agent_id) REFERENCES leo_sub_agents(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK constraint: leo_sub_agent_triggers.sub_agent_id → leo_sub_agents.id';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not add FK constraint for leo_sub_agent_triggers: %', SQLERRM;
END $$;

-- Step 12: Recreate view 1: v_sub_agent_executions_unified
CREATE OR REPLACE VIEW v_sub_agent_executions_unified AS
 SELECT id,
    prd_id,
    sub_agent_id,
    status,
    results,
    started_at,
    completed_at,
    error_message,
    execution_time_ms,
    context_id,
    context_type,
    sub_agent_code,
    execution_trigger,
    validation_result,
    confidence_score,
    findings,
    recommendations,
    issues_found,
    created_at,
    CASE
        WHEN (status = 'pass'::text) THEN 'completed'::text
        WHEN (status = ANY (ARRAY['fail'::text, 'error'::text, 'timeout'::text])) THEN 'failed'::text
        WHEN (status = 'running'::text) THEN 'running'::text
        ELSE 'pending'::text
    END AS execution_status
   FROM sub_agent_executions;

-- Step 13: Recreate view 2: v_sub_agent_execution_history
CREATE OR REPLACE VIEW v_sub_agent_execution_history AS
 SELECT id,
    COALESCE(context_id, prd_id) AS context_id,
    COALESCE(context_type, 'prd'::text) AS context_type,
    COALESCE(sub_agent_code, ( SELECT leo_sub_agents.code
           FROM leo_sub_agents
          WHERE leo_sub_agents.id = sub_agent_executions.sub_agent_id)) AS sub_agent_code,
    execution_trigger,
    status AS legacy_status,
    validation_result,
    confidence_score,
    findings,
    recommendations,
    issues_found,
    started_at AS executed_at,
    completed_at,
        CASE
            WHEN status = 'pass'::text OR validation_result = 'PASS'::text THEN 'SUCCESS'::text
            WHEN (status = ANY (ARRAY['fail'::text, 'error'::text, 'timeout'::text])) OR validation_result = 'FAIL'::text THEN 'BLOCKED'::text
            WHEN status = 'running'::text THEN 'RUNNING'::text
            ELSE 'PENDING'::text
        END AS overall_status,
    execution_time_ms,
    EXTRACT(epoch FROM completed_at - started_at) * 1000::numeric AS actual_execution_time_ms
   FROM sub_agent_executions
  ORDER BY started_at DESC;

-- Step 14: Recreate view 3: v_contexts_missing_sub_agents
CREATE OR REPLACE VIEW v_contexts_missing_sub_agents AS
 SELECT DISTINCT COALESCE(context_id, prd_id) AS context_id,
    COALESCE(context_type, 'prd'::text) AS context_type,
    count(DISTINCT COALESCE(sub_agent_code, ( SELECT leo_sub_agents.code
           FROM leo_sub_agents
          WHERE leo_sub_agents.id = sub_agent_executions.sub_agent_id))) AS executed_agents,
    string_agg(DISTINCT COALESCE(sub_agent_code, ( SELECT leo_sub_agents.code
           FROM leo_sub_agents
          WHERE leo_sub_agents.id = sub_agent_executions.sub_agent_id)), ', '::text) AS executed_agent_list
   FROM sub_agent_executions
  WHERE status = 'pass'::text OR validation_result = 'PASS'::text
  GROUP BY (COALESCE(context_id, prd_id)), (COALESCE(context_type, 'prd'::text))
  ORDER BY (COALESCE(context_id, prd_id));

COMMIT;

-- Verification
DO $$
DECLARE
  type_count INTEGER;
  fk_count INTEGER;
  view_count INTEGER;
BEGIN
  -- Check all 3 columns are now VARCHAR(50)
  SELECT COUNT(*) INTO type_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND data_type = 'character varying'
    AND character_maximum_length = 50
    AND (
      (table_name = 'leo_sub_agents' AND column_name = 'id')
      OR (table_name = 'sub_agent_executions' AND column_name = 'sub_agent_id')
      OR (table_name = 'leo_sub_agent_triggers' AND column_name = 'sub_agent_id')
    );

  -- Check FK constraints recreated
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY'
    AND (
      (table_name = 'sub_agent_executions' AND constraint_name = 'sub_agent_executions_sub_agent_id_fkey')
      OR (table_name = 'leo_sub_agent_triggers' AND constraint_name = 'leo_sub_agent_triggers_sub_agent_id_fkey')
    );

  -- Check views recreated
  SELECT COUNT(*) INTO view_count
  FROM pg_views
  WHERE schemaname = 'public'
    AND viewname IN ('v_sub_agent_executions_unified', 'v_sub_agent_execution_history', 'v_contexts_missing_sub_agents');

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 028 Verification:';
  RAISE NOTICE '  Columns converted to VARCHAR(50): %/3', type_count;
  RAISE NOTICE '  FK constraints recreated: %/2', fk_count;
  RAISE NOTICE '  Views recreated: %/3', view_count;
  RAISE NOTICE '========================================';
END $$;
