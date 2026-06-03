-- @approved-by: rickfelix@example.com
-- =============================================================================
-- E. Move extensions out of `public` (extension_in_public)   *** HIGH RISK ***
-- =============================================================================
-- !!! APPLY SEPARATELY, IN A MAINTENANCE WINDOW, AFTER TESTING ON A SUPABASE DB
-- !!! BRANCH. Verify vector / pg_trgm / ltree queries AND index creation work
-- !!! afterwards. This is the riskiest migration in this set — keep it last.
--
-- Supabase linter `extension_in_public`: vector / pg_trgm / ltree are installed in
-- `public` (the Supabase default). Recommended remediation is to relocate them to a
-- dedicated `extensions` schema so they are not part of the exposed API surface.
--
-- LIVE-VERIFIED PRECONDITIONS (all green):
--   * All three are extrelocatable = true.
--   * None has any RELATION member (no tables/indexes owned BY the extension), so
--     `ALTER EXTENSION ... SET SCHEMA` is a clean metadata move. Dependent objects
--     in OTHER tables — `vector`-typed columns, GIN/GiST trgm indexes, ltree cols —
--     reference the type/opclass by OID and KEEP WORKING after the move.
--   * The `extensions` schema already exists (holds pgcrypto/pgjwt etc.).
--
-- WHY search_path MUST be updated FIRST: unqualified references resolved at QUERY
-- time — the `vector` type in `::vector` casts, the `<->`/`<=>` operators, `%` and
-- `similarity()` from pg_trgm, ltree `@>`/`<@`/`lquery` operators — are looked up
-- via the CALLER's search_path. Today only the `postgres` role has `extensions` in
-- its path; anon/authenticated/service_role do not. We add it to those roles BEFORE
-- moving so there is never a window where these resolve to nothing. (Our own
-- functions were already pinned `..., extensions` by the 2026-06-02 sweep, which
-- deliberately prepared for exactly this move.)
-- =============================================================================

-- 1. Ensure target schema + usage grants (idempotent).
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 2. Put `extensions` on the search_path of the API roles BEFORE the move.
--    (postgres already has `"$user", public, extensions`; we leave it untouched.)
ALTER ROLE anon          SET search_path TO "$user", public, extensions;
ALTER ROLE authenticated SET search_path TO "$user", public, extensions;
ALTER ROLE service_role  SET search_path TO "$user", public, extensions;

-- 3. Relocate the three extensions (guarded so each is a no-op if already moved).
DO $move$
DECLARE
  e TEXT;
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
END
$move$;

-- 4. Verification: none of the three remain in `public`.
DO $verify$
DECLARE
  v_bad INTEGER;
  v_detail TEXT;
BEGIN
  SELECT count(*), string_agg(x.extname, ', ')
    INTO v_bad, v_detail
  FROM pg_extension x JOIN pg_namespace n ON n.oid = x.extnamespace
  WHERE x.extname IN ('vector','ltree','pg_trgm') AND n.nspname = 'public';

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'E NOT cleared: % extension(s) still in public: %', v_bad, v_detail;
  END IF;
  RAISE NOTICE 'E VERIFIED: vector/ltree/pg_trgm are no longer in public.';
END
$verify$;
