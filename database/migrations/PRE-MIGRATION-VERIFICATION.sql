-- ============================================
-- PRE-MIGRATION VERIFICATION SCRIPT
-- ============================================
-- Run this BEFORE executing the idempotent migration
-- to understand current database state
-- ============================================

-- 1. Check which tables already exist
SELECT
  'EXISTING TABLES' as check_type,
  tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'agent_departments',
    'agent_tools',
    'crewai_agents',
    'crewai_crews',
    'crew_members',
    'ab_test_results',
    'search_preferences',
    'agent_executions',
    'performance_alerts'
  )
ORDER BY tablename;

-- 2. Check which triggers already exist
SELECT
  'EXISTING TRIGGERS' as check_type,
  trigger_name,
  event_object_table as table_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND (
    trigger_name LIKE '%validate_sd_progress%' OR
    event_object_table IN (
      'agent_departments',
      'agent_tools',
      'crewai_agents',
      'ab_test_results',
      'search_preferences',
      'agent_executions',
      'performance_alerts'
    )
  )
ORDER BY event_object_table, trigger_name;

-- 3. Check which RLS policies already exist
SELECT
  'EXISTING POLICIES' as check_type,
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'agent_departments',
    'agent_tools',
    'crewai_agents',
    'ab_test_results',
    'search_preferences',
    'agent_executions',
    'performance_alerts'
  )
ORDER BY tablename, policyname;

-- 4. Check seed data counts (if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_departments') THEN
    RAISE NOTICE 'agent_departments exists';
    PERFORM COUNT(*) FROM agent_departments;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_tools') THEN
    RAISE NOTICE 'agent_tools exists';
    PERFORM COUNT(*) FROM agent_tools;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'crewai_agents') THEN
    RAISE NOTICE 'crewai_agents exists';
    PERFORM COUNT(*) FROM crewai_agents;
  END IF;
END $$;

-- 5. Check if strategic_directives_v2 table exists and has trigger
SELECT
  'STRATEGIC_DIRECTIVES_V2 STATUS' as check_type,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2')
    THEN 'TABLE EXISTS'
    ELSE 'TABLE MISSING'
  END as table_status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE event_object_schema = 'public'
      AND event_object_table = 'strategic_directives_v2'
      AND trigger_name = 'validate_sd_progress'
    )
    THEN 'TRIGGER EXISTS'
    ELSE 'TRIGGER MISSING'
  END as trigger_status;

-- ============================================
-- INTERPRETATION GUIDE
-- ============================================
--
-- If you see:
-- - Tables listed in EXISTING TABLES: These were partially created
-- - Triggers listed in EXISTING TRIGGERS: These may cause duplicate errors
-- - Policies listed in EXISTING POLICIES: These may cause duplicate errors
--
-- The idempotent migration will:
-- - Skip table creation (using CREATE TABLE IF NOT EXISTS)
-- - Drop and recreate triggers (using DROP TRIGGER IF EXISTS)
-- - Drop and recreate policies (using DROP POLICY IF EXISTS)
--
-- This is SAFE and will not lose data.
-- ============================================
