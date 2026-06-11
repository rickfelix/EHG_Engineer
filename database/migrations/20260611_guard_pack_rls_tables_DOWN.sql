-- DOWN migration for 20260611_guard_pack_rls_tables.sql
-- SD: SD-MAN-FIX-SECURITY-GUARD-PACK-001
-- @approved-by: codestreetlabs@gmail.com
--
-- Restores the pre-migration state captured 2026-06-11 in
-- .claude/pre-rls-grants.txt: RLS disabled, no policies, and the FULL grant
-- set (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) for
-- anon, authenticated, and service_role on all four tables.
--
-- WARNING: applying this DOWN re-exposes the anon read/write vector that the
-- UP migration closed (F-1 of the 2026-06-10 security posture review).

-- ============================================================================
-- retention_archive
-- ============================================================================
DROP POLICY IF EXISTS service_role_all ON public.retention_archive;
ALTER TABLE public.retention_archive DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.retention_archive TO anon, authenticated, service_role;

-- ============================================================================
-- retention_runs
-- ============================================================================
DROP POLICY IF EXISTS service_role_all ON public.retention_runs;
ALTER TABLE public.retention_runs DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.retention_runs TO anon, authenticated, service_role;

-- ============================================================================
-- coordination_events
-- ============================================================================
DROP POLICY IF EXISTS service_role_all ON public.coordination_events;
ALTER TABLE public.coordination_events DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.coordination_events TO anon, authenticated, service_role;

-- ============================================================================
-- app_config_kill_switch_changes
-- ============================================================================
DROP POLICY IF EXISTS service_role_all ON public.app_config_kill_switch_changes;
ALTER TABLE public.app_config_kill_switch_changes DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.app_config_kill_switch_changes TO anon, authenticated, service_role;
