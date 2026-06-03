-- @approved-by: rickfelix@example.com
-- =============================================================================
-- E. Move extensions out of `public` (extension_in_public)   *** HIGH RISK ***
-- =============================================================================
-- !!! APPLY SEPARATELY, IN A MAINTENANCE WINDOW, AFTER TESTING ON A SUPABASE DB
-- !!! BRANCH. Verify vector / pg_trgm / ltree queries AND index creation work
-- !!! afterwards. This is the riskiest migration in this set — keep it last.
--
-- !!! APPLY AS `supabase_admin` (the extension owner) OR A SUPERUSER — e.g. via the
-- !!! Supabase Dashboard SQL Editor. The `postgres` pooler role used by the normal
-- !!! migration runner is NOT the extension owner and is NOT a superuser, so
-- !!! `ALTER EXTENSION ... SET SCHEMA` fails with "must be owner of extension".
-- !!! Verified 2026-06-03: vector/ltree/pg_trgm are owned by `supabase_admin`, not
-- !!! `postgres`. The ownership precheck (step 0 below) ABORTS cleanly — before ANY
-- !!! change — if the current role cannot ALTER the extensions.
--
-- Supabase linter `extension_in_public`: vector / pg_trgm / ltree are installed in
-- `public` (the Supabase default). Recommended remediation is to relocate them to a
-- dedicated `extensions` schema so they are not part of the exposed API surface.
--
-- LIVE-VERIFIED PRECONDITIONS (all green, re-verified read-only 2026-06-03):
--   * All three are extrelocatable = true.
--   * None has any RELATION member (no tables/indexes owned BY the extension), so
--     `ALTER EXTENSION ... SET SCHEMA` is a clean metadata move. Dependent objects
--     in OTHER tables — `vector`-typed columns, GIN/GiST trgm indexes, ltree cols —
--     reference the type/opclass by OID and KEEP WORKING after the move.
--   * The `extensions` schema already exists (holds pgcrypto/pgjwt etc.).
--   * Owner = `supabase_admin` (NOT postgres) — see apply-role note above.
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

-- 0. Ownership precheck — FAIL FAST before any change if the current role cannot
--    ALTER these extensions. pg_has_role(current_user, owner, 'MEMBER') is true for
--    the owner, members of the owner role, AND superusers.
DO $precheck$
DECLARE
  r     RECORD;
  v_bad TEXT := '';
BEGIN
  FOR r IN
    SELECT x.extname, o.rolname AS owner
    FROM pg_extension x
    JOIN pg_namespace n ON n.oid = x.extnamespace
    JOIN pg_roles o     ON o.oid = x.extowner
    WHERE x.extname IN ('vector','ltree','pg_trgm') AND n.nspname = 'public'
  LOOP
    IF NOT pg_has_role(current_user, r.owner, 'MEMBER') THEN
      v_bad := v_bad || format(' %s(owner=%s)', r.extname, r.owner);
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION
      'E ABORTED (no changes made): role "%" cannot ALTER EXTENSION — it must own the extension, be a member of the owner role, or be a superuser. Blocked:%. Apply migration 05 as supabase_admin via the Supabase Dashboard SQL Editor — NOT the postgres pooler.',
      current_user, v_bad;
  END IF;
  RAISE NOTICE 'E precheck OK: role % can ALTER the target extensions.', current_user;
END
$precheck$;

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
