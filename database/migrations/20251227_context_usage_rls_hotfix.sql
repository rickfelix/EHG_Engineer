-- ============================================================================
-- LEO Protocol - Context Usage RLS Hotfix
-- Migration: 20251227_context_usage_rls_hotfix.sql
-- ============================================================================
-- Purpose: Enable RLS on context_usage tables that were missing it
--
-- Tables affected:
--   - context_usage_log
--   - context_usage_daily
--
-- This is a hotfix to address CI/CD RLS verification failures.
-- The original migration (20251226_context_usage_tracking.sql) has been
-- updated to include RLS, but this migration handles existing deployments.
-- ============================================================================

-- Enable RLS on context_usage_log (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'context_usage_log'
  ) THEN
    RAISE NOTICE 'Table context_usage_log does not exist, skipping';
    RETURN;
  END IF;

  -- Enable RLS
  ALTER TABLE context_usage_log ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE 'RLS enabled on context_usage_log';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error enabling RLS on context_usage_log: %', SQLERRM;
END $$;

-- Enable RLS on context_usage_daily (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'context_usage_daily'
  ) THEN
    RAISE NOTICE 'Table context_usage_daily does not exist, skipping';
    RETURN;
  END IF;

  -- Enable RLS
  ALTER TABLE context_usage_daily ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE 'RLS enabled on context_usage_daily';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error enabling RLS on context_usage_daily: %', SQLERRM;
END $$;

-- Create policies for context_usage_log (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'context_usage_log'
    AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON context_usage_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created authenticated policy on context_usage_log';
  ELSE
    RAISE NOTICE 'Authenticated policy already exists on context_usage_log';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'context_usage_log'
    AND policyname = 'Allow select for anon'
  ) THEN
    CREATE POLICY "Allow select for anon" ON context_usage_log
      FOR SELECT TO anon USING (true);
    RAISE NOTICE 'Created anon policy on context_usage_log';
  ELSE
    RAISE NOTICE 'Anon policy already exists on context_usage_log';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating policies on context_usage_log: %', SQLERRM;
END $$;

-- Create policies for context_usage_daily (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'context_usage_daily'
    AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON context_usage_daily
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created authenticated policy on context_usage_daily';
  ELSE
    RAISE NOTICE 'Authenticated policy already exists on context_usage_daily';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'context_usage_daily'
    AND policyname = 'Allow select for anon'
  ) THEN
    CREATE POLICY "Allow select for anon" ON context_usage_daily
      FOR SELECT TO anon USING (true);
    RAISE NOTICE 'Created anon policy on context_usage_daily';
  ELSE
    RAISE NOTICE 'Anon policy already exists on context_usage_daily';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating policies on context_usage_daily: %', SQLERRM;
END $$;

-- Verify RLS is enabled
DO $$
DECLARE
  v_log_rls BOOLEAN;
  v_daily_rls BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_log_rls
  FROM pg_class WHERE relname = 'context_usage_log';

  SELECT relrowsecurity INTO v_daily_rls
  FROM pg_class WHERE relname = 'context_usage_daily';

  IF v_log_rls AND v_daily_rls THEN
    RAISE NOTICE 'SUCCESS: RLS enabled on both context_usage tables';
  ELSE
    RAISE EXCEPTION 'FAILED: RLS not enabled - log=%, daily=%', v_log_rls, v_daily_rls;
  END IF;
END $$;
