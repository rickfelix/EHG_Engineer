-- SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 — FR-3: close the live plaintext-credential
-- exposure on public.eva_sync_state.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECURITY sub-agent confirmed live (2026-08-26, pg_policies + a real anon-key HTTP GET returning
-- 200 with RLS-filtered rows): select_eva_sync_state grants role=authenticated SELECT with
-- qual=true — ANY authenticated JWT in the app can read eva_sync_state today, including the
-- plaintext YouTube OAuth refresh_token/access_token pair stored in source_metadata. Live grants
-- also show anon and authenticated BOTH hold INSERT/UPDATE/DELETE/TRUNCATE via a systemic
-- pg_default_acl grant — TRUNCATE is not RLS-gated at all, so this is not merely a read exposure.
--
-- SAFE: all 5 real callers (lib/integrations/youtube/oauth-manager.js, playlist-sync.js,
-- lib/integrations/todoist/todoist-sync.js, release-monitor.js, scripts/eva-idea-status.js)
-- already use createSupabaseServiceClient() (service_role), which this migration never touches —
-- confirmed by code read, not assumed. manage_eva_sync_state (service_role, ALL, qual=true) is
-- left completely untouched.
--
-- OUT OF SCOPE: the broader pg_default_acl misconfiguration affects every public-schema table,
-- not just this one — flagged separately as a systemic follow-up, not fixed here (this file only
-- touches public.eva_sync_state).
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260826_eva_sync_state_rls_lockdown.sql" \
--     --prod-deploy --allow-any-path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_sync_state' AND policyname = 'select_eva_sync_state'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown: select_eva_sync_state policy not found — refusing to proceed against an unexpected starting state (already applied, or schema drifted).';
  END IF;
END
$precondition$;

DROP POLICY select_eva_sync_state ON public.eva_sync_state;

-- Explicit per-role REVOKE ALL, not a table-level DROP or a PUBLIC-only revoke: anon and
-- authenticated each hold INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER via the systemic
-- pg_default_acl grant (independent of the RLS policy above), and service_role's own
-- manage_eva_sync_state policy + grants are untouched since service_role is not named here.
REVOKE ALL ON public.eva_sync_state FROM anon, authenticated;

DO $verify$
DECLARE
  v_remaining_grantees TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_sync_state' AND policyname = 'select_eva_sync_state'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown: select_eva_sync_state still present — refusing to consider this applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_sync_state' AND policyname = 'manage_eva_sync_state'
       AND 'service_role' = ANY(roles) AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown: manage_eva_sync_state (service_role) was collaterally altered or dropped — refusing to consider this applied';
  END IF;

  SELECT string_agg(DISTINCT grantee || ':' || privilege_type, ', ') INTO v_remaining_grantees
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'eva_sync_state'
     AND grantee IN ('anon', 'authenticated');

  IF v_remaining_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown: anon/authenticated still hold privilege(s) [%] — refusing to consider this applied', v_remaining_grantees;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'eva_sync_state'
       AND grantee = 'service_role' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown: service_role LOST table privileges — refusing to consider this applied';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.eva_sync_state'::regclass) THEN
    RAISE EXCEPTION 'eva_sync_state RLS lockdown: RLS was disabled on eva_sync_state — refusing to consider this applied';
  END IF;
END
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: see 20260826_eva_sync_state_rls_lockdown_DOWN.sql (same ceremony, chairman-gated)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
