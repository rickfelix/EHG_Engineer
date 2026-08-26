-- SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 — ROLLBACK for
-- 20260826_eva_sync_state_rls_lockdown.sql. Restores select_eva_sync_state and the anon/
-- authenticated table grants to their exact pre-migration state (live-captured 2026-08-26).
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- Only apply if the FR-3 lockdown must be reverted (e.g. an undiscovered legitimate anon/
-- authenticated caller surfaces post-apply) — this RE-OPENS the exposure the UP file closed.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260826_eva_sync_state_rls_lockdown_DOWN.sql" \
--     --prod-deploy --allow-any-path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_sync_state' AND policyname = 'select_eva_sync_state'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown DOWN: select_eva_sync_state already present — refusing to proceed against an unexpected starting state.';
  END IF;
END
$precondition$;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.eva_sync_state TO anon, authenticated;

CREATE POLICY select_eva_sync_state ON public.eva_sync_state
  FOR SELECT TO authenticated
  USING (true);

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_sync_state' AND policyname = 'select_eva_sync_state'
       AND 'authenticated' = ANY(roles) AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown DOWN: select_eva_sync_state was not restored correctly — refusing to consider this applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'eva_sync_state'
       AND grantee = 'anon' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown DOWN: anon grants were not restored — refusing to consider this applied';
  END IF;
END
$verify$;
