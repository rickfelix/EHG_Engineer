-- @approved-by:
-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-5) -- close the recurrence source for anon TRUNCATE on
-- new tables, mirroring database/chairman-gated/20260816_defacl_anon_auth_axis.sql (same mechanism,
-- TRUNCATE ON TABLES substituted for EXECUTE ON FUNCTIONS).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except at the named ceremony.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE MECHANISM THIS CLOSES (live-measured, LEAD + PLAN phase, 2026-08-18/19): pg_default_acl
-- carries 5 rows granting anon TRUNCATE by default on tables -- (postgres,public), (postgres,storage),
-- (supabase_admin,public), (supabase_admin,graphql), (supabase_admin,graphql_public). Without closing
-- the postgres-owned rows, every table created by postgres (this house's own migration identity) in
-- schema public or schema storage is born with anon TRUNCATE already granted -- the 20260819_anon_
-- truncate_sweep.sql migration (staged alongside this file) closes the CURRENT 760-table population;
-- this file closes the recurrence source for FUTURE tables.
--
-- SCOPE: TWO statements, one per postgres-owned default-ACL row (public, storage). The three
-- supabase_admin-owned rows (public, graphql, graphql_public) CANNOT be altered from this
-- environment -- ALTER DEFAULT PRIVILEGES FOR ROLE X requires the applying session to BE X or hold
-- membership in X, and pg_has_role(postgres, 'supabase_admin', 'MEMBER')=false (same measured limit
-- already documented in 20260816_defacl_anon_auth_axis.sql's REWORK section). They are named here as
-- a disclosed, deferred residual, not silently dropped -- fixing them, if ever needed, would require
-- a Supabase-platform-level change, not a database/chairman-gated/ file.
--
-- Does NOT touch: service_role grants; any table that already exists (see the sweep migration for
-- the current population); the anon/authenticated axis for FUNCTIONS (already closed separately by
-- 20260816_defacl_anon_auth_axis.sql); the authenticated-role TRUNCATE default (out of scope --
-- this SD's Deletion Audit cuts the authenticated axis except for the single named FR-6 exception).

BEGIN;

-- ACCESS EXCLUSIVE is not required (ALTER DEFAULT PRIVILEGES only mutates pg_default_acl catalog
-- rows, not any live object), but a bounded wait is house convention for every statement here.
SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE TRUNCATE ON TABLES FROM anon;

-- Post-condition: confirm the postgres-owned defaults no longer grant anon TRUNCATE on tables. A
-- MISSING pg_default_acl row counts as success (ALTER DEFAULT PRIVILEGES deletes the row entirely
-- when an entry empties), not failure.
DO $$
DECLARE
  public_bad boolean;
  storage_bad boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN pg_roles r ON r.oid = da.defaclrole
    WHERE r.rolname = 'postgres' AND n.nspname = 'public' AND da.defaclobjtype = 'r'
      AND EXISTS (
        SELECT 1 FROM aclexplode(da.defaclacl) a
        JOIN pg_roles ar ON ar.oid = a.grantee
        WHERE ar.rolname = 'anon' AND a.privilege_type = 'TRUNCATE'
      )
  ) INTO public_bad;

  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN pg_roles r ON r.oid = da.defaclrole
    WHERE r.rolname = 'postgres' AND n.nspname = 'storage' AND da.defaclobjtype = 'r'
      AND EXISTS (
        SELECT 1 FROM aclexplode(da.defaclacl) a
        JOIN pg_roles ar ON ar.oid = a.grantee
        WHERE ar.rolname = 'anon' AND a.privilege_type = 'TRUNCATE'
      )
  ) INTO storage_bad;

  IF public_bad OR storage_bad THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: postgres-owned default still grants anon TRUNCATE (public=%, storage=%)', public_bad, storage_bad;
  END IF;
  RAISE NOTICE 'POST_CONDITION_PASSED: postgres-owned defaults (public, storage) no longer grant anon TRUNCATE';
END $$;

COMMIT;
