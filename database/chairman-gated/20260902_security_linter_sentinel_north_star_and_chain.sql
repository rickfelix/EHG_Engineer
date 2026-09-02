-- @approved-by: <pending -- apply via the chairman's 3-factor ceremony>
-- =============================================================================
-- Closes the last 2 of the 12 security-linter-sentinel.yml rls_disabled_in_public
-- findings, PLUS the function_search_path_mutable finding for
-- set_session_awaiting_approval -- SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001.
--
-- Full disposition of all 3 --strict finding classes (verified live 2026-09-02):
--   rls_disabled_in_public (12 tables) -- the other 10 close via
--     database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql
--     (SD-LEO-FIX-TRIAGE-THREE-FAILING-001, corrected 2026-09-02 -- see that file's own
--     header); this file closes north_star + scope_completion_chain below.
--   sensitive_columns_exposed (1, claim_rejects) -- a subset of rls_disabled_in_public
--     per scripts/sentinels/audit-security-linter.mjs's own predicate; closes as a side
--     effect of claim_rejects's RLS-enable in 20260831, nothing additional needed here.
--   function_search_path_mutable (2, NOT 1 as originally scoped -- corrected after
--     PLAN-adjacent VALIDATION review found a second, more recent offender):
--     - log_sd_mutation_audit: pin already staged, unapplied, in
--       database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql
--       (bogus @approved-by stamp blanked 2026-09-02, was never a real chairman approval).
--     - set_session_awaiting_approval: NO pin existed anywhere before this file -- a fresh
--       regression, created SECURITY DEFINER with no SET search_path by
--       database/migrations/20260901_session_awaiting_approval_rpc.sql:9-12 (2026-09-01,
--       one day before this SD). Pinned below.
--     fn_advance_venture_stage, which database/migrations/20260616_security_hygiene_rls_
--     searchpath.sql also pins, is CONFIRMED ALREADY PINNED live (pg_proc.proconfig
--     already carries search_path=public) -- that portion of 20260616 is a behavior-neutral
--     no-op for this finding class; only its scope_completion_chain RLS-enable+policy half
--     is load-bearing.
-- STAGED, NOT APPLIED -- security-posture change, chairman ceremony required per
-- database/chairman-gated/README.md.
--
-- requires-chairman-apply
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THESE TWO NEEDED SEPARATE HANDLING (not the blanket enable+revoke pattern)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Both were excluded from the zero-consumer blanket migrations above because a bare
-- ENABLE ROW LEVEL SECURITY with no policy would silently break a real, live consumer
-- for anon/authenticated (confirmed live 2026-09-02 via direct pg_catalog query --
-- both tables currently have relrowsecurity=false and full anon+authenticated grants,
-- including SELECT/INSERT/UPDATE/DELETE, i.e. a live unauthenticated read/write surface
-- today, same class as venture_preview_instances):
--
--   north_star -- has a real, live anon-key browser consumer (ehg repo's
--     src/hooks/useNorthStar.ts + src/components/eva-chat/intents/northStarIntent.ts),
--     confirmed by database/chairman-gated/20260825_enable_rls_chronic_red_guard_
--     zero_consumer_tables.sql's own evidence (which excluded it for exactly this
--     reason). That file named the follow-up need explicitly: "a real, verified POLICY
--     scoped to its actual query filter (status='chairman_ratified')". This migration
--     is that follow-up. Columns confirmed live: north_star(id uuid, definition text,
--     metric text, target jsonb, sustain text, measurement_source text, cadence text,
--     status text, provenance jsonb, created_at, updated_at) -- status is a plain text
--     column, so the policy below matches useNorthStar.ts's own read filter exactly.
--
--   scope_completion_chain -- the RLS-enable + read policy already exist, staged and
--     unapplied, in database/migrations/20260616_security_hygiene_rls_searchpath.sql
--     (confirmed live 2026-09-02: relrowsecurity=false, 0 policies -- that migration was
--     never applied). Re-authoring the RLS-enable/policy here would duplicate that file
--     and race it at apply time. This migration adds only the write-grant REVOKE that
--     file does not include, matching the standard pattern used across every other
--     table in this sentinel remediation (mirrors 20260731_coordination_receipts_
--     rls_posture.sql). Apply 20260616_security_hygiene_rls_searchpath.sql and this
--     file together for scope_completion_chain's full closure (either order -- the
--     REVOKE below does not depend on the RLS-enable having landed first).
--
-- POST-APPLY VERIFICATION: re-run `node scripts/sentinels/audit-security-linter.mjs --strict`
-- -- rls_disabled_in_public should drop to 0 once this file, 20260831 (corrected), and
-- 20260616_security_hygiene_rls_searchpath.sql have all been applied.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- north_star -- RLS-enable + scoped read policy + write-grant revoke
-- ----------------------------------------------------------------------------
ALTER TABLE public.north_star ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.north_star'::regclass
      AND polname = 'north_star_read_ratified'
  ) THEN
    CREATE POLICY north_star_read_ratified
      ON public.north_star
      FOR SELECT
      TO anon, authenticated
      USING (status = 'chairman_ratified');
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.north_star FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- scope_completion_chain -- write-grant revoke only (RLS-enable + read policy
-- staged separately in database/migrations/20260616_security_hygiene_rls_searchpath.sql)
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.scope_completion_chain FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- set_session_awaiting_approval -- pin search_path (function_search_path_mutable)
-- SECURITY DEFINER, LANGUAGE sql, body references only claude_sessions (unqualified,
-- resolves in public) + jsonb_set/COALESCE/to_jsonb/now (pg_catalog builtins). No temp
-- objects. Mirrors the log_sd_mutation_audit pin's precedent and pinned path.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.set_session_awaiting_approval(text, boolean)
  SET search_path = public, pg_catalog;

-- ----------------------------------------------------------------------------
-- Self-verification -- fails loudly if any piece did not land.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_rls_enabled  boolean;
  v_policy_count integer;
  v_north_star_write_grants integer;
  v_chain_write_grants integer;
  v_session_fn_searchpath text[];
  v_chain_rls_enabled boolean;
BEGIN
  SELECT c.relrowsecurity,
         (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
    INTO v_rls_enabled, v_policy_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'north_star';

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY FAILED: RLS not enabled on north_star';
  END IF;
  IF v_policy_count < 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: no policy on north_star';
  END IF;

  SELECT count(*) INTO v_north_star_write_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'north_star'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  IF v_north_star_write_grants > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: north_star still has % anon/authenticated write grant(s)', v_north_star_write_grants;
  END IF;

  SELECT count(*) INTO v_chain_write_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'scope_completion_chain'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  IF v_chain_write_grants > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: scope_completion_chain still has % anon/authenticated write grant(s)', v_chain_write_grants;
  END IF;

  SELECT p.proconfig
    INTO v_session_fn_searchpath
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_session_awaiting_approval';

  IF v_session_fn_searchpath IS NULL
     OR NOT EXISTS (SELECT 1 FROM unnest(v_session_fn_searchpath) x WHERE x LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'VERIFY FAILED: set_session_awaiting_approval search_path not pinned';
  END IF;

  -- SECURITY review (EXEC, SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001, finding SEC-1): this file
  -- owns only scope_completion_chain's write-grant revoke, not its RLS-enable/policy (that half
  -- ships separately in database/migrations/20260616_security_hygiene_rls_searchpath.sql, to
  -- avoid duplicate/racing authorship). A non-blocking NOTICE (not a RAISE EXCEPTION -- this file
  -- must not hard-fail on a companion file's apply order) flags the ceremony operator if
  -- scope_completion_chain's RLS is not yet enabled, so applying this file alone is never read as
  -- full closure for that table.
  SELECT c.relrowsecurity
    INTO v_chain_rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'scope_completion_chain';

  IF v_chain_rls_enabled IS DISTINCT FROM true THEN
    RAISE WARNING 'scope_completion_chain RLS is NOT yet enabled -- apply database/migrations/20260616_security_hygiene_rls_searchpath.sql too for full closure (this file only revoked its write grants)';
  END IF;

  RAISE NOTICE 'VERIFY OK: north_star RLS+policy+revoke present; scope_completion_chain revoke present; set_session_awaiting_approval search_path pinned';
END $verify$;
