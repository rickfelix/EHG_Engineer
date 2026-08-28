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
-- SEQUENCING INTERACTION WITH THE TRUNCATE SWEEP (mirrors the UP file's own note, adversarial
-- /ship review finding, EXEC-TO-PLAN): this file re-grants TRUNCATE to anon unconditionally (below)
-- because that is genuinely part of eva_youtube_intake's pre-UP state (live-captured 2026-08-28).
-- If database/chairman-gated/20260819_anon_truncate_sweep.sql (SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001)
-- has ALSO been applied by the time this DOWN runs, running this DOWN silently re-opens the TRUNCATE
-- exposure that sweep separately closed for this table. Read this aloud at the ceremony if the sweep
-- has landed.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260828_eva_youtube_intake_rls_lockdown_DOWN.sql" \
--     --prod-deploy --allow-any-path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
DECLARE
  v_existing_grantees TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_youtube_intake' AND policyname = 'select_eva_youtube_intake'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: select_eva_youtube_intake already present — refusing to proceed against an unexpected starting state.';
  END IF;

  -- Policy absence alone is not evidence THIS migration's UP is what removed it (adversarial /ship
  -- review finding, EXEC-TO-PLAN) — a policy can be missing for unrelated reasons (a later migration,
  -- a manual drop, a table that never had it), and this DOWN would otherwise re-grant broad access
  -- into a state it never took away from. Also require the fully-locked-down grant state the UP file
  -- actually produces: zero anon/authenticated/PUBLIC privileges. Same LEFT JOIN pattern as the UP
  -- file's verify block, for the same PUBLIC-blind-spot reason.
  SELECT string_agg(DISTINCT coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ', ') INTO v_existing_grantees
    FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = 'public.eva_youtube_intake'::regclass), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = 'public.eva_youtube_intake'::regclass)))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE r.rolname IN ('anon', 'authenticated') OR r.rolname IS NULL;

  IF v_existing_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: anon/authenticated/PUBLIC already hold privilege(s) [%] — refusing to proceed against an unexpected starting state (not the fully-locked-down state this migration''s UP produces).', v_existing_grantees;
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
DECLARE
  v_priv TEXT;
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
  --
  -- Widened from a single anon/SELECT check to all 7 PG16-portable privileges for BOTH anon and
  -- authenticated (adversarial /ship review finding, EXEC-TO-PLAN): the prior version only proved
  -- one grant of one privilege for one role was restored, not that the full pre-migration grant set
  -- came back.
  FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
  LOOP
    IF NOT has_table_privilege('anon', 'public.eva_youtube_intake', v_priv) THEN
      RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: anon did not get % restored — refusing to consider this applied', v_priv;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.eva_youtube_intake', v_priv) THEN
      RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: authenticated did not get % restored — refusing to consider this applied', v_priv;
    END IF;
  END LOOP;

  -- The $restore_maintain$ block above (dynamic EXECUTE, version-guarded) has no other assertion
  -- of its own success — verify it here rather than trusting an unchecked EXECUTE (adversarial
  -- /ship review finding).
  IF current_setting('server_version_num')::int >= 170000 THEN
    IF NOT has_table_privilege('anon', 'public.eva_youtube_intake', 'MAINTAIN')
       OR NOT has_table_privilege('authenticated', 'public.eva_youtube_intake', 'MAINTAIN') THEN
      RAISE EXCEPTION 'eva_youtube_intake RLS lockdown DOWN: anon/authenticated did not get MAINTAIN (PG17+) restored — refusing to consider this applied';
    END IF;
  END IF;
END
$verify$;
