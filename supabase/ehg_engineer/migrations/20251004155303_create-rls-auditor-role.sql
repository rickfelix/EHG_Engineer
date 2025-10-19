-- Migration: Create rls_auditor PostgreSQL Role
-- Purpose: Read-only database role for RLS policy verification
-- Security: SELECT-only permissions on system catalogs, no data access
-- Rotation: 90-day schedule documented in .env.example

-- Create role without login capability (accessed via connection string only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_auditor') THEN
    CREATE ROLE rls_auditor NOLOGIN;
    RAISE NOTICE 'Created role: rls_auditor';
  ELSE
    RAISE NOTICE 'Role rls_auditor already exists, skipping creation';
  END IF;
END
$$;

-- Grant SELECT permission on pg_policies system catalog
GRANT SELECT ON pg_catalog.pg_policies TO rls_auditor;

-- Grant SELECT permission on information_schema tables
GRANT SELECT ON information_schema.tables TO rls_auditor;
GRANT SELECT ON information_schema.columns TO rls_auditor;

-- Grant USAGE on schema to allow access
GRANT USAGE ON SCHEMA information_schema TO rls_auditor;

-- Verify permissions
DO $$
DECLARE
  has_pg_policies BOOLEAN;
  has_tables BOOLEAN;
BEGIN
  -- Check pg_policies access
  SELECT has_table_privilege('rls_auditor', 'pg_catalog.pg_policies', 'SELECT') INTO has_pg_policies;

  -- Check information_schema.tables access
  SELECT has_table_privilege('rls_auditor', 'information_schema.tables', 'SELECT') INTO has_tables;

  IF has_pg_policies AND has_tables THEN
    RAISE NOTICE '✅ rls_auditor permissions verified successfully';
    RAISE NOTICE '  - pg_policies: SELECT granted';
    RAISE NOTICE '  - information_schema.tables: SELECT granted';
  ELSE
    RAISE EXCEPTION '❌ Permission verification failed. pg_policies: %, tables: %', has_pg_policies, has_tables;
  END IF;
END
$$;

-- Document role purpose and limitations
COMMENT ON ROLE rls_auditor IS 'Read-only role for automated RLS policy verification. Permissions: SELECT on pg_policies and information_schema only. No data access. Rotation schedule: 90 days.';

-- Output summary
SELECT
  'rls_auditor' AS role_name,
  (SELECT has_table_privilege('rls_auditor', 'pg_catalog.pg_policies', 'SELECT')) AS can_read_pg_policies,
  (SELECT has_table_privilege('rls_auditor', 'information_schema.tables', 'SELECT')) AS can_read_tables,
  '90 days' AS rotation_schedule,
  'Read-only system catalog access only' AS security_scope;
