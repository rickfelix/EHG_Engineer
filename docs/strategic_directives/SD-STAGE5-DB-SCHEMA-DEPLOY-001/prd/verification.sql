-- SD-STAGE5-DB-SCHEMA-DEPLOY-001: Database Verification Queries
-- Purpose: Verify deployment of Stage 5 database tables
-- Target Database: EHG (liapbndqlqxdcgpwntbv)
-- Run these queries BEFORE and AFTER deployment

-- ====================
-- AC1: Tables Exist
-- ====================
-- Expected BEFORE: All FALSE
-- Expected AFTER: All TRUE

SELECT
  to_regclass('public.recursion_events') IS NOT NULL AS recursion_events_exists,
  to_regclass('public.crewai_agents') IS NOT NULL AS crewai_agents_exists,
  to_regclass('public.crewai_crews') IS NOT NULL AS crewai_crews_exists,
  to_regclass('public.crewai_tasks') IS NOT NULL AS crewai_tasks_exists;

-- ====================
-- AC2: Minimal Columns Present
-- ====================
-- Expected BEFORE: 0 rows (tables don't exist)
-- Expected AFTER: 6 columns for recursion_events, 6 for crewai_agents

-- recursion_events columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'recursion_events'
  AND column_name IN ('id','venture_id','from_stage','to_stage','trigger_type','created_by')
ORDER BY column_name;

-- crewai_agents columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'crewai_agents'
  AND column_name IN ('id','name','role','agent_type','status','created_at')
ORDER BY column_name;

-- ====================
-- AC3: RLS Policies Present
-- ====================
-- Expected BEFORE: 0 rows
-- Expected AFTER: Multiple policies (exact count depends on migration design)

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('recursion_events','crewai_agents','crewai_crews','crewai_tasks')
ORDER BY tablename, policyname;

-- ====================
-- AC4: Indexes Created
-- ====================
-- Expected BEFORE: 0 rows
-- Expected AFTER: At least primary key indexes, possibly performance indexes

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('recursion_events','crewai_agents','crewai_crews','crewai_tasks')
  AND schemaname = 'public'
ORDER BY tablename, indexname;

-- ====================
-- AC5: Runtime Verification (manual)
-- ====================
-- After deployment, verify INSERT operations work
-- Run: cd /mnt/c/_EHG/ehg && npx playwright test tests/e2e/recursion-workflows.spec.ts --reporter=line
-- Expected: 20/20 scenarios pass (or at least no "relation does not exist" errors)

-- ====================
-- Baseline Check (RUN FIRST)
-- ====================
-- Verify current state BEFORE deployment
-- This should show NO tables exist

SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'recursion_events' AND schemaname = 'public')
         AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'crewai_agents' AND schemaname = 'public')
         AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'crewai_crews' AND schemaname = 'public')
         AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'crewai_tasks' AND schemaname = 'public')
    THEN 'BASELINE CONFIRMED: No tables exist (ready for deployment)'
    ELSE 'WARNING: One or more tables already exist. Check current state.'
  END AS baseline_status;

-- Detailed baseline: Show which tables (if any) already exist
SELECT
  tablename,
  'Table already exists' AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('recursion_events','crewai_agents','crewai_crews','crewai_tasks')
ORDER BY tablename;
