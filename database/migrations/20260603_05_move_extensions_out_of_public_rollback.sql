-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK E. Move vector/ltree/pg_trgm back to `public` and reset the API-role
-- search_paths to their prior state (anon/authenticated/service_role had NO
-- search_path override before migration E; postgres was never modified).
-- Move FIRST (while extensions is still on the path), then reset the path.
-- =============================================================================
DO $move$
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
END
$move$;

-- Restore prior role search_paths (these three roles had no override originally).
ALTER ROLE anon          RESET search_path;
ALTER ROLE authenticated RESET search_path;
ALTER ROLE service_role  RESET search_path;
