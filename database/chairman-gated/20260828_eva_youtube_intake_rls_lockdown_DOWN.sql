-- SD-FDBK-FIX-EVA-YOUTUBE-INTAKE-001 — ROLLBACK for
-- 20260828_eva_youtube_intake_rls_lockdown.sql. Restores select_eva_youtube_intake and the anon/
-- authenticated table grants to their pre-migration state (live-captured 2026-08-28), including
-- the PG17+ MAINTAIN privilege (version-guarded below, mirroring the eva_sync_state DOWN file).
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- Only apply if the lockdown must be reverted (e.g. an undiscovered legitimate anon/authenticated
-- caller surfaces post-apply) — this RE-OPENS the exposure the UP file closed.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260828_eva_youtube_intake_rls_lockdown_DOWN.sql" \
--     --prod-deploy --allow-any-path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_youtube_intake' AND policyname = 'select_eva_youtube_intake'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: select_eva_youtube_intake already present — refusing to proceed against an unexpected starting state.';
  END IF;
END
$precondition$;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.eva_youtube_intake TO anon, authenticated;

-- MAINTAIN does not exist as a grantable keyword before PG17 — a bare GRANT MAINTAIN would fail
-- to parse on the CI DDL tier's PG16 ephemeral container. Dynamic SQL via EXECUTE defers parsing
-- to runtime, so this branch is safely skipped there instead of causing a syntax error.
DO $restore_maintain$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'GRANT MAINTAIN ON public.eva_youtube_intake TO anon, authenticated';
  END IF;
END
$restore_maintain$;

CREATE POLICY select_eva_youtube_intake ON public.eva_youtube_intake
  FOR SELECT TO authenticated
  USING (true);

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_youtube_intake' AND policyname = 'select_eva_youtube_intake'
       AND 'authenticated' = ANY(roles) AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: select_eva_youtube_intake was not restored correctly — refusing to consider this applied';
  END IF;

  -- pg_catalog aclexplode(), NOT information_schema.role_table_grants — aligned with the UP
  -- file's instrument choice (VALIDATION sub-agent finding C4: the two files previously disagreed
  -- about which instrument is authoritative for this table).
  IF NOT EXISTS (
    SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = 'public.eva_youtube_intake'::regclass), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = 'public.eva_youtube_intake'::regclass)))) a
    JOIN pg_roles r ON r.oid = a.grantee
     WHERE r.rolname = 'anon' AND a.privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: anon grants were not restored — refusing to consider this applied';
  END IF;
END
$verify$;
