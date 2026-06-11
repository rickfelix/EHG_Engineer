-- Migration: enable RLS + service_role-only policies on 4 anon-writable tables
-- SD: SD-MAN-FIX-SECURITY-GUARD-PACK-001 (remediates F-1 of
--     docs/security/security-posture-review-2026-06-10.md)
-- @approved-by: codestreetlabs@gmail.com
--
-- WHY: All four tables were live with RLS DISABLED and FULL anon/authenticated
-- DML grants (captured 2026-06-11 in .claude/pre-rls-grants.txt — anon held
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on every one).
-- retention_archive alone holds ~196k archived audit rows that were
-- anon-readable AND anon-writable.
--
-- NOTE: this migration SUPERSEDES the never-applied
-- database/migrations/20260608_coordination_events_rls.sql (orphan from
-- SD-LEO-GEN-ENABLE-RLS-SERVICE-001). coordination_events is folded in here
-- with the same lockdown intent; the 20260608 append-only trigger design is
-- NOT carried forward (service_role keeps FOR ALL via policy — RLS +
-- grant-revocation from anon/authenticated is the actual vulnerability fix,
-- and service_role bypasses RLS regardless).
--
-- PER-TABLE READER DECISIONS (verified by code grep 2026-06-11):
--   retention_archive            — writers/readers: scripts/retention-enforce.js,
--                                  scripts/dr/restore-rehearsal.mjs (service-role /
--                                  pg-direct only). Archived AUDIT rows: revoke
--                                  EVERYTHING incl. SELECT from anon+authenticated.
--   retention_runs               — same writer set (retention-enforce.js). No UI
--                                  reader. Revoke all from anon+authenticated.
--   coordination_events          — all readers/writers are server-side coordinator
--                                  infra (lib/coordinator/row-growth.cjs,
--                                  lib/coordinator/coordination-events.cjs,
--                                  scripts/row-growth-snapshot.cjs,
--                                  scripts/modules/handoff/{artifact-preflight,
--                                  gate-verdict-cache}.js) using the service-role
--                                  key. grep '.from(''coordination_events'')' in
--                                  ../ehg/src: ZERO matches — no authenticated UI
--                                  reader exists. Revoke all from anon+authenticated.
--   app_config_kill_switch_changes — audit log written by trigger
--                                  (20260516120001_app_config_kill_switch_audit.sql);
--                                  only reader is scripts/lineage/audit-kill-switch-write.mjs
--                                  (service-role). No UI reader. Revoke all from
--                                  anon+authenticated.
--
-- SAFETY: service_role bypasses RLS (Supabase BYPASSRLS) and additionally gets
-- an explicit FOR ALL policy, so every existing writer/reader is unaffected.
-- Idempotent: safe to re-run. Reversible: 20260611_guard_pack_rls_tables_DOWN.sql
-- restores the captured pre-migration grants verbatim.

-- ============================================================================
-- retention_archive
-- ============================================================================
ALTER TABLE public.retention_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.retention_archive;
CREATE POLICY service_role_all ON public.retention_archive
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Archived audit rows: anon/authenticated must hold NOTHING (incl. SELECT).
REVOKE ALL ON public.retention_archive FROM anon, authenticated;

-- ============================================================================
-- retention_runs
-- ============================================================================
ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.retention_runs;
CREATE POLICY service_role_all ON public.retention_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.retention_runs FROM anon, authenticated;

-- ============================================================================
-- coordination_events  (supersedes 20260608_coordination_events_rls.sql)
-- ============================================================================
ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.coordination_events;
CREATE POLICY service_role_all ON public.coordination_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- No authenticated UI reader exists (verified above) — revoke everything.
REVOKE ALL ON public.coordination_events FROM anon, authenticated;

-- ============================================================================
-- app_config_kill_switch_changes
-- ============================================================================
ALTER TABLE public.app_config_kill_switch_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.app_config_kill_switch_changes;
CREATE POLICY service_role_all ON public.app_config_kill_switch_changes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.app_config_kill_switch_changes FROM anon, authenticated;
