# DIRECT TO PRODUCTION - Database Housekeeping
## ⛔ EMERGENCY USE ONLY - HIGH RISK PATH ⛔

**THIS DOCUMENT IS FOR EMERGENCY SITUATIONS ONLY**
**RECOMMENDED: Use staging → production promotion instead**

## HARD STOP CONDITIONS
If ANY of these are false, **ABORT IMMEDIATELY**:
- [ ] Chairman has explicitly approved direct production execution
- [ ] Full backup completed within last 15 minutes
- [ ] PITR recovery point confirmed
- [ ] Incident response team on standby
- [ ] Rollback plan tested and ready

## Mandatory Pre-Execution Gates

### Gate 1: Backup Verification
```bash
# MUST EXECUTE - NO EXCEPTIONS
BACKUP_FILE="backups/prod_pre_housekeeping_$(date +%Y%m%d_%H%M%S).dump"

# Take backup
pg_dump -h $PROD_HOST -U $PROD_USER -d $PROD_DB \
  --format=custom \
  --verbose \
  --file=$BACKUP_FILE

# Verify backup integrity
pg_restore --list $BACKUP_FILE > /dev/null || {
  echo "FATAL: Backup verification failed. ABORT ALL OPERATIONS."
  exit 1
}

# Record backup details
echo "Backup: $BACKUP_FILE" >> ops/audit/2025-09-22-prod.md
echo "Size: $(ls -lh $BACKUP_FILE | awk '{print $5}')" >> ops/audit/2025-09-22-prod.md
echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> ops/audit/2025-09-22-prod.md

# PITR checkpoint
psql $PROD_DATABASE_URL -c "SELECT pg_current_wal_lsn() as wal_position" \
  >> ops/audit/2025-09-22-prod.md
```

### Gate 2: Maintenance Window
```bash
# Verify maintenance window is active
CURRENT_HOUR=$(date +%H)
if [ $CURRENT_HOUR -lt 2 ] || [ $CURRENT_HOUR -gt 4 ]; then
  echo "ERROR: Outside maintenance window (02:00-04:00 UTC)"
  echo "Current time: $(date -u)"
  exit 1
fi

# Set application to maintenance mode
curl -X POST $APP_URL/api/maintenance/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Gate 3: Trial Compilation (Read-Only Test)
```bash
# Test all views compile WITHOUT making changes
psql $PROD_DATABASE_URL <<EOF
BEGIN;
SET LOCAL statement_timeout = '30s';

-- Test as analyst role
SET LOCAL ROLE analyst_ro;

-- Attempt to query each view (will fail if schema is broken)
SELECT 1 FROM views.eng_governance_summary LIMIT 0;
SELECT 1 FROM views.vh_linkage_status LIMIT 0;

-- If we got here, views would compile
ROLLBACK;
EOF

if [ $? -ne 0 ]; then
  echo "FATAL: View compilation test failed. DO NOT PROCEED."
  exit 1
fi
```

## Execution Script (ALL OR NOTHING)

Create and review this script BEFORE execution:

```bash
#!/bin/bash
# File: ops/scripts/prod_housekeeping_apply.sh
set -euo pipefail

# Trap any error and initiate rollback
trap 'echo "ERROR DETECTED - INITIATING ROLLBACK"; bash ops/scripts/emergency_rollback.sh' ERR

# Enable strict error handling in psql
export PGOPTIONS='--client-min-messages=warning'
export ON_ERROR_STOP=1

echo "Starting production housekeeping at $(date -u)"

# Phase 1: Single transaction for all changes
psql $PROD_DATABASE_URL <<'EOSQL'
\set ON_ERROR_STOP on
\timing on

BEGIN;

-- Set lock timeout to prevent hanging
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Save current state
CREATE TEMP TABLE rollback_state AS
SELECT
  'pre_housekeeping' as checkpoint,
  NOW() as timestamp,
  current_user,
  version()
;

-- ENGINEERING SCHEMA CHANGES
\echo 'Applying engineering migrations...'

-- Apply each eng migration
\i db/migrations/eng/001_base_tables.sql
\i db/migrations/eng/002_governance_tables.sql
\i db/migrations/eng/003_rls_policies.sql

-- Verify eng schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'eng'
      AND table_name = 'strategic_directives_v2'
  ) THEN
    RAISE EXCEPTION 'Critical table eng.strategic_directives_v2 missing';
  END IF;
END $$;

-- VENTURE HUB SCHEMA CHANGES
\echo 'Applying venture hub migrations...'

-- Apply each vh migration
\i db/migrations/vh/001_base_tables.sql
\i db/migrations/vh/002_linkage_tables.sql

-- VIEWS
\echo 'Creating views...'
\i db/views/eng_governance_views.sql
\i db/views/vh_readonly_views.sql

-- RLS POLICIES
\echo 'Applying RLS policies...'
\i db/policies/eng_rls_policies.sql
\i db/policies/vh_rls_policies.sql

-- FINAL VERIFICATION
\echo 'Running final checks...'

-- Check RLS is enabled
DO $$
DECLARE
  unprotected_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unprotected_count
  FROM pg_tables
  WHERE schemaname IN ('eng', 'vh')
    AND tablename LIKE '%sensitive%'
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'Found % unprotected sensitive tables', unprotected_count;
  END IF;
END $$;

-- Check no cross-boundary writes
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO violation_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'eng'
    AND grantee LIKE 'vh_%'
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Found % cross-boundary write violations', violation_count;
  END IF;
END $$;

-- Log success
INSERT INTO audit.change_log (table_name, operation, user_name, timestamp, row_data)
VALUES (
  'system',
  'PROD_HOUSEKEEPING_COMPLETE',
  current_user,
  NOW(),
  jsonb_build_object(
    'status', 'success',
    'phase', 'all',
    'checkpoint', 'pre_commit'
  )
);

-- COMMIT POINT - ALL OR NOTHING
COMMIT;

\echo 'Production housekeeping completed successfully'
EOSQL
```

## Smoke Tests (MUST PASS ALL)

```bash
#!/bin/bash
# Run immediately after execution

echo "=== Running smoke tests ==="

# Test 1: Tables exist
psql $PROD_DATABASE_URL -c "
  SELECT COUNT(*) as table_count
  FROM information_schema.tables
  WHERE table_schema IN ('eng', 'vh')
" || exit 1

# Test 2: Views accessible
psql $PROD_DATABASE_URL -c "
  SET ROLE analyst_ro;
  SELECT COUNT(*) FROM views.eng_governance_summary;
" || exit 1

# Test 3: RLS active
psql $PROD_DATABASE_URL -c "
  SET ROLE analyst_ro;
  SELECT COUNT(*) FROM eng.strategic_directives_v2;
" 2>&1 | grep -q "permission denied" || {
  echo "CRITICAL: RLS not working!"
  exit 1
}

# Test 4: Audit trail
psql $PROD_DATABASE_URL -c "
  SELECT COUNT(*) as audit_entries
  FROM audit.change_log
  WHERE operation = 'PROD_HOUSEKEEPING_COMPLETE'
    AND timestamp > NOW() - INTERVAL '5 minutes'
" || exit 1

echo "=== All smoke tests passed ==="
```

## Emergency Rollback Procedure

```bash
#!/bin/bash
# File: ops/scripts/emergency_rollback.sh

echo "!!! EMERGENCY ROLLBACK INITIATED !!!"
echo "Time: $(date -u)"

# Step 1: Stop all services
systemctl stop ehg-app || true
systemctl stop ehg-ingest || true

# Step 2: Restore from backup
LATEST_BACKUP=$(ls -t backups/prod_pre_housekeeping_*.dump | head -1)
echo "Restoring from: $LATEST_BACKUP"

pg_restore -h $PROD_HOST -U $PROD_USER -d $PROD_DB \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  $LATEST_BACKUP

# Step 3: Verify restoration
psql $PROD_DATABASE_URL -c "
  SELECT 'ROLLBACK_COMPLETE' as status,
         NOW() as completed_at
"

# Step 4: Restart services
systemctl start ehg-app
systemctl start ehg-ingest

# Step 5: Send alerts
curl -X POST $ALERT_WEBHOOK -d '{
  "text": "EMERGENCY: Production rollback completed",
  "severity": "critical"
}'

echo "!!! ROLLBACK COMPLETE !!!"
```

## Critical Monitoring

During and after execution, monitor:

```bash
# Terminal 1: Error monitoring
watch -n 1 'psql $PROD_DATABASE_URL -c "
  SELECT level, COUNT(*) as count
  FROM audit.service_logs
  WHERE timestamp > NOW() - INTERVAL \"1 minute\"
  GROUP BY level
"'

# Terminal 2: Connection monitoring
watch -n 1 'psql $PROD_DATABASE_URL -c "
  SELECT state, COUNT(*)
  FROM pg_stat_activity
  GROUP BY state
"'

# Terminal 3: Lock monitoring
watch -n 1 'psql $PROD_DATABASE_URL -c "
  SELECT relation::regclass, mode, granted
  FROM pg_locks
  WHERE NOT granted
"'
```

## Abort Conditions

**IMMEDIATELY ROLLBACK IF:**
- Any ERROR in logs during execution
- Lock timeout exceeded
- More than 5 deadlocks detected
- Application response time > 5 seconds
- Database CPU > 80%
- Any team member calls for abort

## Post-Execution Checklist

- [ ] All smoke tests passed
- [ ] No errors in last 10 minutes
- [ ] Application health check green
- [ ] Audit log shows complete execution
- [ ] Performance metrics normal
- [ ] No user complaints
- [ ] Backup verification completed
- [ ] Rollback plan still viable

## Required Signatures

This operation requires explicit approval from:

- [ ] Database Administrator: _____________ Time: _______
- [ ] Security Officer: _____________ Time: _______
- [ ] Chairman/CTO: _____________ Time: _______

## Final Warning

**This procedure bypasses ALL safety mechanisms.**
**Data loss is possible if not executed correctly.**
**Consider ALL alternatives before proceeding.**

If you must proceed, may fortune favor the brave.