#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Staging Database Checks ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Source environment
ENV_FILE="${PSQL_ENV:-.env.staging}"
echo "Using environment: $ENV_FILE"

# Create checks SQL
TEMP_SQL=$(mktemp /tmp/staging_checks.XXXXXX.sql)
trap "rm -f $TEMP_SQL" EXIT

cat > "$TEMP_SQL" <<'EOSQL'
-- Staging Verification Checks
\set ON_ERROR_STOP on
\timing on

\echo '=== Schema Verification ==='
SELECT schema_name,
       CASE WHEN schema_name IN ('eng', 'vh', 'audit', 'views')
            THEN '✓ Present'
            ELSE '✗ Missing'
       END as status
FROM information_schema.schemata
WHERE schema_name IN ('eng', 'vh', 'audit', 'views')
ORDER BY schema_name;

\echo '=== Table Counts by Schema ==='
SELECT table_schema, COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema IN ('eng', 'vh', 'audit')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;

\echo '=== Engineering Tables ==='
SELECT table_name,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as size,
       n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'eng'
ORDER BY table_name;

\echo '=== Venture Hub Tables ==='
SELECT table_name,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as size,
       n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'vh'
ORDER BY table_name;

\echo '=== Foreign Key Relationships ==='
SELECT
    tc.table_schema || '.' || tc.table_name as "Table",
    tc.constraint_name as "Constraint",
    ccu.table_schema || '.' || ccu.table_name as "References"
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema IN ('eng', 'vh')
ORDER BY tc.table_schema, tc.table_name;

\echo '=== Cross-Boundary Check (Should be empty) ==='
-- Check for direct FKs between eng and vh (should be none)
SELECT
    tc.table_schema || '.' || tc.table_name as "Table",
    ccu.table_schema || '.' || ccu.table_name as "References",
    'VIOLATION: Cross-boundary FK' as issue
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'vh'
  AND ccu.table_schema = 'eng';

\echo '=== RLS Status Check ==='
SELECT
    schemaname || '.' || tablename as "Table",
    CASE WHEN rowsecurity THEN '✓ Enabled' ELSE '✗ Disabled' END as "RLS Status"
FROM pg_tables
WHERE schemaname IN ('eng', 'vh')
ORDER BY schemaname, tablename;

\echo '=== Migration History ==='
SELECT version, applied_at, applied_by
FROM audit.migration_log
ORDER BY applied_at DESC
LIMIT 5;

\echo '=== User Permissions Check ==='
SELECT
    grantee,
    table_schema,
    COUNT(*) as permission_count,
    string_agg(DISTINCT privilege_type, ', ') as privileges
FROM information_schema.role_table_grants
WHERE grantee = 'codex_staging'
  AND table_schema IN ('eng', 'vh', 'audit')
GROUP BY grantee, table_schema
ORDER BY table_schema;

\echo '=== Checks Complete ==='
EOSQL

# Run checks
PSQL_ENV="$ENV_FILE" bash ops/scripts/psql_exec.sh -f "$TEMP_SQL"

echo "=== Staging Checks Complete ==="