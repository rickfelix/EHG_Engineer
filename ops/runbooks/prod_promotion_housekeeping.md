# Production Promotion Runbook - Database Housekeeping

**⚠️ DO NOT EXECUTE UNTIL STAGING IS FULLY VALIDATED**

## Pre-Promotion Checklist

### 1. Staging Validation Complete
- [ ] All Codex scripts ran successfully on staging
- [ ] No errors in ops/audit/2025-09-22.md
- [ ] Row counts match expectations
- [ ] Views compile without errors
- [ ] RLS policies are active and tested
- [ ] Audit trail shows complete execution

### 2. Production Backup
```bash
# Take logical backup
pg_dump -h $PROD_HOST -U $PROD_USER -d $PROD_DB \
  --format=custom \
  --file=backups/prod_$(date +%Y%m%d_%H%M%S).dump

# Verify backup
pg_restore --list backups/prod_*.dump | head -20

# Note backup location and size
ls -lh backups/prod_*.dump
```

### 3. Snapshot/PITR
- [ ] Confirm point-in-time recovery is configured
- [ ] Note current WAL position: `SELECT pg_current_wal_lsn()`
- [ ] Document recovery point timestamp

### 4. Communication
- [ ] Maintenance window scheduled
- [ ] Stakeholders notified
- [ ] Incident response team on standby
- [ ] Communication channel open (Slack/Teams)

## Promotion Sequence

### Phase 1: Engineering Schema (eng_*)

```bash
# 1. Apply engineering migrations
for file in $(ls db/migrations/eng/*.sql | sort); do
  echo "Applying: $file"
  psql $PROD_DATABASE_URL \
    --set ON_ERROR_STOP=1 \
    --single-transaction \
    -f "$file"
done

# 2. Apply engineering views
psql $PROD_DATABASE_URL \
  --set ON_ERROR_STOP=1 \
  --single-transaction \
  -f db/views/eng_governance_views.sql

# 3. Apply engineering RLS policies
psql $PROD_DATABASE_URL \
  --set ON_ERROR_STOP=1 \
  --single-transaction \
  -f db/policies/eng_rls_policies.sql

# 4. Verify engineering schema
psql $PROD_DATABASE_URL -c "
  SELECT
    schemaname,
    tablename,
    rowsecurity
  FROM pg_tables
  WHERE schemaname = 'eng'
    AND rowsecurity = true
  ORDER BY tablename;
"
```

### Phase 2: Venture Hub Schema (vh_*)

```bash
# 1. Apply venture hub migrations
for file in $(ls db/migrations/vh/*.sql | sort); do
  echo "Applying: $file"
  psql $PROD_DATABASE_URL \
    --set ON_ERROR_STOP=1 \
    --single-transaction \
    -f "$file"
done

# 2. Apply venture hub views
psql $PROD_DATABASE_URL \
  --set ON_ERROR_STOP=1 \
  --single-transaction \
  -f db/views/vh_readonly_views.sql

# 3. Verify no cross-boundary writes
psql $PROD_DATABASE_URL -c "
  SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema IN ('eng', 'vh')
    AND grantee LIKE 'vh_%'
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    AND table_schema = 'eng';
"
# Expected: 0 rows (vh users cannot write to eng tables)
```

### Phase 3: CI/CD Policy Updates

```bash
# Update GitHub Actions workflow
cat <<EOF > .github/workflows/boundary-check.yml
name: Boundary Enforcement
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check cross-app boundaries
        run: |
          # Verify no vh_* writing to eng_*
          ! grep -r "INSERT INTO eng_" apps/vh/ || exit 1
          ! grep -r "UPDATE eng_" apps/vh/ || exit 1
          ! grep -r "DELETE FROM eng_" apps/vh/ || exit 1
EOF

git add .github/workflows/boundary-check.yml
git commit -m "feat: Add cross-boundary write protection in CI"
```

## Post-Promotion Verification

### 1. Schema Verification
```bash
# Check all expected tables exist
psql $PROD_DATABASE_URL -c "
  SELECT
    table_schema,
    COUNT(*) as table_count
  FROM information_schema.tables
  WHERE table_schema IN ('eng', 'vh')
  GROUP BY table_schema;
"

# Verify view compilation
psql $PROD_DATABASE_URL -c "
  SELECT
    schemaname,
    viewname
  FROM pg_views
  WHERE schemaname = 'views'
  ORDER BY viewname;
"
```

### 2. RLS Testing
```bash
# Test as analyst role (should fail on direct table access)
psql $PROD_DATABASE_URL -c "
  SET ROLE analyst_ro;
  SELECT COUNT(*) FROM eng.strategic_directives_v2;
" 2>&1 | grep -q "permission denied" && echo "✓ RLS working" || echo "✗ RLS FAILED"

# Test view access (should succeed)
psql $PROD_DATABASE_URL -c "
  SET ROLE analyst_ro;
  SELECT COUNT(*) FROM views.eng_governance_summary;
" && echo "✓ View access working"
```

### 3. Audit Trail
```bash
psql $PROD_DATABASE_URL -c "
  SELECT
    operation,
    COUNT(*) as count,
    MAX(timestamp) as latest
  FROM audit.change_log
  WHERE timestamp > NOW() - INTERVAL '1 hour'
  GROUP BY operation
  ORDER BY latest DESC;
"
```

## Feature Flag Ramping

### Ingest Service (10% → 50% → 100%)

```javascript
// Step 1: 10% rollout
const INGEST_ROLLOUT_PERCENTAGE = 10;

// Step 2: Monitor for 30 minutes, check metrics
// If stable, increase to 50%
const INGEST_ROLLOUT_PERCENTAGE = 50;

// Step 3: Monitor for 1 hour
// If stable, full rollout
const INGEST_ROLLOUT_PERCENTAGE = 100;
```

### Monitoring During Ramp
```bash
# Watch error rates
watch -n 10 "psql $PROD_DATABASE_URL -c \"
  SELECT
    COUNT(*) FILTER (WHERE level = 'ERROR') as errors,
    COUNT(*) FILTER (WHERE level = 'WARNING') as warnings,
    COUNT(*) as total
  FROM audit.service_logs
  WHERE timestamp > NOW() - INTERVAL '10 minutes'
\""

# Check ingest success rate
psql $PROD_DATABASE_URL -c "
  SELECT
    DATE_TRUNC('minute', created_at) as minute,
    COUNT(*) FILTER (WHERE status = 'success') as success,
    COUNT(*) FILTER (WHERE status = 'failed') as failed
  FROM vh.ingest_runs
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY minute
  ORDER BY minute DESC;
"
```

## Rollback Plan

### Immediate Rollback (< 5 minutes after deployment)
```bash
# 1. Disable ingest service
systemctl stop ehg-ingest

# 2. Restore from backup
pg_restore -h $PROD_HOST -U $PROD_USER -d $PROD_DB \
  --clean --if-exists \
  backups/prod_[TIMESTAMP].dump

# 3. Verify restoration
psql $PROD_DATABASE_URL -c "SELECT version FROM audit.migration_log ORDER BY applied_at DESC LIMIT 1"
```

### Partial Rollback (specific components)
```bash
# Roll back specific migrations
psql $PROD_DATABASE_URL -f db/migrations/DOWN/[specific_migration].sql

# Disable specific features via flags
export VH_INGEST_ENABLED=false
export ENG_GOVERNANCE_SYNC=false
```

### Communication Template
```
Subject: [ROLLBACK INITIATED] Database Housekeeping Promotion

Status: Rolling back due to [ISSUE]
Impact: [Description of impact]
ETA: [Estimated completion time]
Action Required: [Any user action needed]

Will update in 15 minutes.
```

## Success Criteria

All of the following must be true:
- [ ] Zero errors in production logs
- [ ] All views return data
- [ ] RLS blocks direct table access for analyst_ro
- [ ] Audit trail shows expected operations
- [ ] No cross-boundary write attempts logged
- [ ] CI boundary checks passing
- [ ] Ingest service processing at expected rate
- [ ] No performance degradation (< 10% increase in p95 latency)

## Sign-off

- [ ] Engineering Lead: _________________ Date: _______
- [ ] Database Admin: _________________ Date: _______
- [ ] Security Team: _________________ Date: _______
- [ ] Product Owner: _________________ Date: _______