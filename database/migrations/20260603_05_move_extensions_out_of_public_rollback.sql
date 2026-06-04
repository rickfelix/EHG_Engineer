-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK E. Move vector/ltree/pg_trgm back to `public` and reset the API-role
-- search_paths to their prior state (anon/authenticated/service_role had NO
-- search_path override before migration E; postgres was never modified).
-- Move FIRST (while extensions is still on the path), then reset the path.
--
-- APPLY-ROLE: same as the forward migration — the running role must be able to ALTER
-- these extensions. On Supabase the `postgres` role CAN (effective ALTER via
-- supabase_privileged_role + rolbypassrls, despite NOT being a supabase_admin member;
-- `pg_has_role(...,'supabase_admin','MEMBER')` is a false-negative, so we do not
-- precheck it). The move-back's own `ALTER EXTENSION` is the capability test — if the
-- role lacks privilege it raises insufficient_privilege and the atomic block aborts
-- with no change. The Supabase Dashboard SQL Editor also runs as `postgres`.
--
-- ATOMICITY: the move-back and the search_path RESET run inside ONE DO block, so a
-- failed move-back can never leave the search_path reset (or vice versa).
-- =============================================================================

-- ATOMIC: move back to public FIRST (while `extensions` is still on the path), then
-- reset the API-role search_paths — all-or-nothing in one DO block.
DO $apply$
DECLARE
  e TEXT;
BEGIN
  -- The ALTER EXTENSION is the capability test (we do NOT precheck pg_has_role — it
  -- is a false-negative for `postgres` on Supabase). A privilege failure aborts the
  -- whole atomic block, so the search_path RESET below never runs on a failed move.
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
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'ROLLBACK E ABORTED (no changes persisted): role "%" lacks privilege to ALTER EXTENSION. Apply as a role with ALTER-EXTENSION rights — on Supabase the `postgres` role (Dashboard SQL Editor or pooler) works; supabase_admin membership is NOT required.', current_user;
  END;

  -- Restore prior role search_paths (these three roles had no override originally).
  -- RESET removes only the search_path setting; preserves other per-role settings.
  EXECUTE 'ALTER ROLE anon          RESET search_path';
  EXECUTE 'ALTER ROLE authenticated RESET search_path';
  EXECUTE 'ALTER ROLE service_role  RESET search_path';
END
$apply$;
