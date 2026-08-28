-- SD-FDBK-FIX-EVA-YOUTUBE-INTAKE-001 — close the live exposure on public.eva_youtube_intake.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Confirmed live via a direct pg_policies/information_schema query (2026-08-28), mirroring the
-- sibling eva_sync_state finding exactly: select_eva_youtube_intake grants role=authenticated
-- SELECT with qual=true — ANY authenticated JWT in the app can read eva_youtube_intake today.
-- Live grants also show anon and authenticated BOTH hold INSERT/UPDATE/DELETE/TRUNCATE via the
-- same systemic pg_default_acl grant — TRUNCATE is not RLS-gated at all.
--
-- Why this table matters for secret exposure: SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001
-- (completed 2026-08-28, PR #7597) backfilled the chairman-classified low-grade-secret YouTube
-- "For Processing" playlist ID out of eva_youtube_intake.raw_data.playlistItem.snippet.playlistId
-- on all 304 rows — but a TESTING sub-agent adversarial follow-up found (independently confirmed)
-- that the SAME playlist ID remains 100% recoverable from youtube_playlist_item_id (base64-decodes
-- to "<playlistId>.<itemHash>" on every row, one distinct constant across the table). That column
-- cannot be scrubbed without breaking the disposal path (playlistItems.delete needs the real
-- value), so the only remaining protection surface is access control — this migration.
--
-- SAFE: an exhaustive caller audit (very-thorough Explore pass, 2026-08-28) found ZERO real code
-- callers of eva_youtube_intake using an anon-key or authenticated-key Supabase client anywhere in
-- the repo — zero .tsx/.jsx references, zero src/app/api/pages references, every real caller uses
-- createSupabaseServiceClient() (service_role) or an inline createClient(url,
-- SUPABASE_SERVICE_ROLE_KEY) with no anon fallback. The one partial exception,
-- lib/discovery/source-registry.js's db() helper, falls back to SUPABASE_ANON_KEY only if
-- SUPABASE_SERVICE_ROLE_KEY is unset (never true in a real deployment) — this migration makes
-- that fallback path fail loud (permission denied) instead of silently reading with the wrong
-- privilege, which is strictly safer, not a new break. manage_eva_youtube_intake (service_role,
-- ALL, qual=true) is left completely untouched.
--
-- OUT OF SCOPE / OVERLAP NOTE: the broader pg_default_acl misconfiguration affects every
-- public-schema table, not just this one (same note as the eva_sync_state migration). The
-- TRUNCATE half of this table's exposure is ALREADY staged separately in
-- database/chairman-gated/20260819_anon_truncate_sweep.sql (SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001,
-- ceremony QF-20260803-856), which revokes anon's TRUNCATE on 760 tables including
-- public.eva_youtube_intake (line 282/1044 of that file) — NEVER applied as of this writing. This
-- migration's own REVOKE ALL below still legitimately includes TRUNCATE for this one table
-- (idempotent if the sweep lands first, complete if it doesn't) — the genuinely NEW work here is
-- the disclosure half (select_eva_youtube_intake's authenticated/qual=true SELECT policy), which
-- the sweep does not touch at all (it only revokes TRUNCATE, only from anon).
--
-- SEQUENCING INTERACTION (SECURITY sub-agent finding, sibling SD review): the sweep's own rollback,
-- 20260819_anon_truncate_sweep_DOWN.sql, RE-GRANTS TRUNCATE ON public.eva_youtube_intake TO anon
-- (line 247). If this migration applies first, then the sweep applies, then the sweep is LATER
-- rolled back, that rollback partially re-opens this table (TRUNCATE only — the disclosure-half
-- REVOKE ALL below is unaffected since the sweep never re-grants SELECT/INSERT/UPDATE/DELETE). Not
-- a blocker for applying either migration independently, but the chairman ceremony for whichever
-- applies second should be aware the two are not fully independent.
--
-- GRANT ENUMERATION: unlike the eva_sync_state sibling migration (which queries
-- information_schema.role_table_grants), this file's verify block uses pg_catalog aclexplode() for
-- the anon/authenticated/service_role privilege checks. Per the anon_truncate_sweep migration's own
-- documented finding, information_schema.role_table_grants is role-filtered and can return different
-- results under different connecting identities — aclexplode() is the authoritative instrument (see
-- that migration's header/lines 44, 1594 for the pattern this file follows).
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260828_eva_youtube_intake_rls_lockdown.sql" \
--     --prod-deploy --allow-any-path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_youtube_intake' AND policyname = 'select_eva_youtube_intake'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: select_eva_youtube_intake policy not found — refusing to proceed against an unexpected starting state (already applied, or schema drifted).';
  END IF;
END
$precondition$;

DROP POLICY select_eva_youtube_intake ON public.eva_youtube_intake;

-- Explicit per-role REVOKE ALL, not a table-level DROP: anon and authenticated each hold
-- INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER via the systemic pg_default_acl grant
-- (independent of the RLS policy above), and service_role's own manage_eva_youtube_intake policy +
-- grants are untouched since service_role is not named here.
--
-- PUBLIC is named too (round-2 adversarial /ship review finding): the verify block below detects a
-- PUBLIC grant (LEFT JOIN + rolname IS NULL) but a bare `FROM anon, authenticated` would never
-- remediate one — it would only abort the migration mid-way, after DROP POLICY/REVOKE ALL already
-- ran, leaving the chairman to hand-fix. No PUBLIC grant exists on this table today (verified live
-- 2026-08-28), so this is a verified no-op now and a self-healing revoke if one is ever added.
REVOKE ALL ON public.eva_youtube_intake FROM anon, authenticated, PUBLIC;

DO $verify$
DECLARE
  v_remaining_grantees TEXT;
  v_rel regclass := 'public.eva_youtube_intake'::regclass;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_youtube_intake' AND policyname = 'select_eva_youtube_intake'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: select_eva_youtube_intake still present — refusing to consider this applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'eva_youtube_intake' AND policyname = 'manage_eva_youtube_intake'
       AND 'service_role' = ANY(roles) AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: manage_eva_youtube_intake (service_role) was collaterally altered or dropped — refusing to consider this applied';
  END IF;

  -- pg_catalog aclexplode(), NOT information_schema.role_table_grants: the latter is role-filtered
  -- and can return different results under different connecting identities (SECURITY sub-agent
  -- finding on the sibling anon_truncate_sweep migration, which uses this same instrument). A
  -- false-negative here (reporting "no remaining grants" when some exist) would mask an incomplete
  -- REVOKE, so this negative-assertion check uses the authoritative instrument.
  --
  -- LEFT JOIN, not JOIN, and rolname IS NULL is also flagged: aclexplode() represents a PUBLIC grant
  -- as grantee=0, which an INNER JOIN to pg_roles silently drops (adversarial /ship review finding,
  -- EXEC-TO-PLAN). REVOKE ALL ... FROM anon, authenticated (above) never touches a PUBLIC grant, so
  -- if one were ever added to this table, anon/authenticated would still read via it while this
  -- check reported "no remaining grants" — the exact false-negative the paragraph above warns
  -- against. No PUBLIC grant exists on this table today (verified live 2026-08-28), but the check
  -- itself must not depend on that staying true.
  SELECT string_agg(DISTINCT coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ', ') INTO v_remaining_grantees
    FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = v_rel), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = v_rel)))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE r.rolname IN ('anon', 'authenticated') OR r.rolname IS NULL;

  IF v_remaining_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: anon/authenticated still hold privilege(s) [%] — refusing to consider this applied', v_remaining_grantees;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = v_rel), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = v_rel)))) a
    JOIN pg_roles r ON r.oid = a.grantee
     WHERE r.rolname = 'service_role' AND a.privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: service_role LOST table privileges — refusing to consider this applied';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.eva_youtube_intake'::regclass) THEN
    RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: RLS is not enabled on eva_youtube_intake — refusing to consider this applied';
  END IF;

  -- MAINTAIN is a PostgreSQL 17+ table privilege NOT reported by information_schema.role_table_
  -- grants (a SQL-standard view predating MAINTAIN) — mirrors the eva_sync_state migration's own
  -- verify-side fix for the same blind spot. Version-guarded so it is a genuine no-op on the CI
  -- DDL tier's PG16 ephemeral container.
  IF current_setting('server_version_num')::int >= 170000 THEN
    IF has_table_privilege('anon', 'public.eva_youtube_intake', 'MAINTAIN')
       OR has_table_privilege('authenticated', 'public.eva_youtube_intake', 'MAINTAIN') THEN
      RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: anon/authenticated still hold MAINTAIN (PG17+) — refusing to consider this applied';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.eva_youtube_intake', 'MAINTAIN') THEN
      RAISE EXCEPTION 'eva_youtube_intake RLS lockdown: service_role LOST MAINTAIN (PG17+) — refusing to consider this applied';
    END IF;
  END IF;
END
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: see 20260828_eva_youtube_intake_rls_lockdown_DOWN.sql (same ceremony, chairman-gated)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
