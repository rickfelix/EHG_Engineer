-- Verification queries for SD-LEO-INFRA-DATABASE-CONSTRAINT-SCHEMA-001
-- Run after applying the three constraint fix migrations

-- 1. Verify sub_agent_execution_results verdict constraint
SELECT
  'BL-INF-2337A: sub_agent_execution_results verdict constraint' as check_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'valid_verdict'
  AND conrelid = 'sub_agent_execution_results'::regclass;

-- 2. Verify risk_assessments phase constraint
SELECT
  'BL-INF-2337B: risk_assessments phase constraint' as check_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'risk_assessments_phase_check'
  AND conrelid = 'risk_assessments'::regclass;

-- 3. Verify retrospectives metadata column
SELECT
  'BL-INF-2337C: retrospectives metadata column' as check_name,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'retrospectives'
  AND column_name = 'metadata';

-- 4. Verify retrospectives metadata index
SELECT
  'BL-INF-2337C: retrospectives metadata index' as check_name,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'retrospectives'
  AND indexname = 'idx_retrospectives_metadata';
