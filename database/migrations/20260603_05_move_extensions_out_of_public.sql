-- @approved-by: rickfelix@example.com
-- =============================================================================
-- E. Move extensions out of `public` (extension_in_public)   *** HIGH RISK ***
-- =============================================================================
-- !!! APPLY SEPARATELY, IN A MAINTENANCE WINDOW, AFTER TESTING ON A SUPABASE DB
-- !!! BRANCH. Verify vector / pg_trgm / ltree queries AND index creation work
-- !!! afterwards, and RECYCLE THE CONNECTION POOLER — the role-search_path change
-- !!! below only affects NEW connections, so pooled sessions opened before the move
-- !!! keep the old path (and could fail on UNQUALIFIED ext refs) until recycled.
-- !!! This is the riskiest migration in this set — keep it last.
--
-- APPLY-ROLE: the running role must be able to ALTER these extensions. On Supabase
-- the `postgres` role CAN (verified 2026-06-04) — it has effective ALTER capability
-- via membership in `supabase_privileged_role` + `rolbypassrls`, EVEN THOUGH it is
-- NOT a member of `supabase_admin` and `pg_has_role(current_user,'supabase_admin',
-- 'MEMBER')` returns false. That membership test is NOT a reliable proxy for
-- ALTER-EXTENSION capability, so this migration does NOT precheck it. Instead the
-- move's own `ALTER EXTENSION` IS the capability test (step 3): if the role truly
-- lacks privilege it raises insufficient_privilege and the whole atomic block aborts
-- with guidance — no partial state. The Supabase Dashboard SQL Editor also runs as
-- `postgres`, so either the Dashboard or the pooler works.
--
-- Supabase linter `extension_in_public`: vector / pg_trgm / ltree are installed in
-- `public` (the Supabase default). Recommended remediation is to relocate them to a
-- dedicated `extensions` schema so they are not part of the exposed API surface.
--
-- LIVE-VERIFIED PRECONDITIONS (all green, re-verified 2026-06-03/04):
--   * All three are extrelocatable = true.
--   * None has any RELATION member (no tables/indexes owned BY the extension), so
--     `ALTER EXTENSION ... SET SCHEMA` is a clean metadata move. Dependent objects
--     in OTHER tables — `vector`-typed columns, GIN/GiST trgm indexes, ltree cols —
--     reference the type/opclass by OID and KEEP WORKING after the move.
--   * The `extensions` schema already exists (holds pgcrypto/pgjwt etc.).
--   * Owner = `supabase_admin`, but the `postgres` role has effective ALTER rights.
--
-- WHY search_path MUST be updated FIRST: unqualified references resolved at QUERY
-- time — the `vector` type in `::vector` casts, the `<->`/`<=>` operators, `%` and
-- `similarity()` from pg_trgm, ltree `@>`/`<@`/`lquery` operators — are looked up
-- via the CALLER's search_path. Today only the `postgres` role has `extensions` in
-- its path; anon/authenticated/service_role do not. We add it to those roles BEFORE
-- moving so there is never a window where these resolve to nothing. (Our own
-- functions were already pinned `..., extensions` by the 2026-06-02 sweep, which
-- deliberately prepared for exactly this move.)
--
-- ATOMICITY: the role-search_path change, the extension move, and the verification
-- run inside ONE DO block (a single statement). An unhandled error anywhere in that
-- block rolls the WHOLE block back, so a failed move can NEVER leave the API roles'
-- search_path changed without the move having happened. This holds whether or not
-- the migration runner wraps the file in an outer transaction.
-- =============================================================================

-- 1. Ensure target schema + usage grants (idempotent).
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 2+3+4. ATOMIC: set the API roles' search_path FIRST, then relocate the three
--    extensions, then verify — all inside one DO block so a failed move cannot leave
--    the search_path changed.
DO $apply$
DECLARE
  e        TEXT;
  v_bad    INTEGER;
  v_detail TEXT;
BEGIN
  -- 2. search_path FIRST. ALTER ROLE ... SET search_path replaces ONLY the
  --    search_path setting and preserves other per-role settings (e.g. the
  --    statement_timeout currently set on anon/authenticated). Run via EXECUTE
  --    because utility commands are not allowed as direct PL/pgSQL statements.
  EXECUTE 'ALTER ROLE anon          SET search_path TO "$user", public, extensions';
  EXECUTE 'ALTER ROLE authenticated SET search_path TO "$user", public, extensions';
  EXECUTE 'ALTER ROLE service_role  SET search_path TO "$user", public, extensions';

  -- 3. Relocate the three extensions (guarded so each is a no-op if already moved).
  --    The ALTER EXTENSION is itself the capability test (we do NOT precheck
  --    pg_has_role — it is a false-negative for `postgres` on Supabase, which CAN
  --    ALTER these). If the running role genuinely lacks privilege, the ALTER raises
  --    insufficient_privilege, which we convert to a clear abort; because this is the
  --    same atomic DO block, the step-2 search_path change rolls back with it.
  BEGIN
    FOREACH e IN ARRAY ARRAY['vector','ltree','pg_trgm'] LOOP
      IF EXISTS (
        SELECT 1 FROM pg_extension x JOIN pg_namespace n ON n.oid = x.extnamespace
        WHERE x.extname = e AND n.nspname = 'public'
      ) THEN
        EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', e);
        RAISE NOTICE 'E: moved extension % from public -> extensions', e;
      ELSE
        RAISE NOTICE 'E: extension % not in public (already moved or absent) — skipped', e;
      END IF;
    END LOOP;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'E ABORTED (no changes persisted): role "%" lacks privilege to ALTER EXTENSION. Apply as a role with ALTER-EXTENSION rights — on Supabase the `postgres` role (Dashboard SQL Editor or pooler) works; supabase_admin membership is NOT required.', current_user;
  END;

  -- 4. Verification (same atomic block): none of the three remain in `public`.
  SELECT count(*), string_agg(x.extname, ', ')
    INTO v_bad, v_detail
  FROM pg_extension x JOIN pg_namespace n ON n.oid = x.extnamespace
  WHERE x.extname IN ('vector','ltree','pg_trgm') AND n.nspname = 'public';

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'E NOT cleared: % extension(s) still in public: % (whole block rolled back)', v_bad, v_detail;
  END IF;
  RAISE NOTICE 'E VERIFIED: vector/ltree/pg_trgm are no longer in public.';
END
$apply$;
