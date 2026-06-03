-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK E. Move vector/ltree/pg_trgm back to `public` and reset the API-role
-- search_paths to their prior state (anon/authenticated/service_role had NO
-- search_path override before migration E; postgres was never modified).
-- Move FIRST (while extensions is still on the path), then reset the path.
--
-- !!! APPLY AS `supabase_admin` (the extension owner) OR A SUPERUSER — same as the
-- !!! forward migration. The `postgres` pooler role cannot ALTER EXTENSION. The
-- !!! ownership precheck (step 0) aborts cleanly (no changes) if it cannot.
--
-- ATOMICITY: the move-back and the search_path RESET run inside ONE DO block, so a
-- failed move-back can never leave the search_path reset (or vice versa).
-- =============================================================================

-- 0. Ownership precheck — fail fast (no changes) if current role cannot ALTER.
DO $precheck$
DECLARE
  r     RECORD;
  v_bad TEXT := '';
BEGIN
  FOR r IN
    SELECT x.extname, o.rolname AS owner
    FROM pg_extension x JOIN pg_roles o ON o.oid = x.extowner
    WHERE x.extname IN ('vector','ltree','pg_trgm')
  LOOP
    IF NOT pg_has_role(current_user, r.owner, 'MEMBER') THEN
      v_bad := v_bad || format(' %s(owner=%s)', r.extname, r.owner);
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION
      'ROLLBACK E ABORTED (no changes made): role "%" cannot ALTER EXTENSION — must own it, be a member of the owner role, or be a superuser. Blocked:%. Apply as supabase_admin via the Supabase Dashboard SQL Editor — NOT the postgres pooler.',
      current_user, v_bad;
  END IF;
  RAISE NOTICE 'ROLLBACK E precheck OK: role % can ALTER the target extensions.', current_user;
END
$precheck$;

-- ATOMIC: move back to public FIRST (while `extensions` is still on the path), then
-- reset the API-role search_paths — all-or-nothing in one DO block.
DO $apply$
DECLARE
  e TEXT;
BEGIN
  FOREACH e IN ARRAY ARRAY['vector','ltree','pg_trgm'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_extension x JOIN pg_namespace n ON n.oid = x.extnamespace
      WHERE x.extname = e AND n.nspname = 'extensions'
    ) THEN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA public', e);
      RAISE NOTICE 'ROLLBACK E: moved extension % extensions -> public', e;
    END IF;
  END LOOP;

  -- Restore prior role search_paths (these three roles had no override originally).
  -- RESET removes only the search_path setting; preserves other per-role settings.
  EXECUTE 'ALTER ROLE anon          RESET search_path';
  EXECUTE 'ALTER ROLE authenticated RESET search_path';
  EXECUTE 'ALTER ROLE service_role  RESET search_path';
END
$apply$;
