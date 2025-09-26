# 🚀 WSJF Pipeline Go-Live Checklist

## 🔴 IMMEDIATE: Security Actions Required

### ⚠️ CRITICAL - Rotate Exposed Credentials NOW
1. [ ] **Generate new database password** in Supabase Dashboard
2. [ ] **Update GitHub Secrets** (Settings → Secrets → Actions):
   - [ ] `PGHOST_PROD` = `aws-1-us-east-1.pooler.supabase.com`
   - [ ] `PGPORT_PROD` = `5432`
   - [ ] `PGDATABASE_PROD` = `postgres`
   - [ ] `PGUSER_PROD` = `postgres.dedlbzhpgkmetvhbkyzq`
   - [ ] `PGPASSWORD_PROD` = `[NEW_PASSWORD]`
3. [ ] **Revoke old password** in Supabase
4. [ ] **Clear shell history**: `history -c && history -w`
5. [ ] **Purge credentials** from:
   - [ ] Local .env files
   - [ ] Shell scripts
   - [ ] PR comments
   - [ ] Issue descriptions

---

## 📋 Pre-Production Checklist

### Database Migrations
- [ ] Apply proposals table migration:
  ```bash
  psql $DATABASE_URL -f database/migrations/2025-09-22-eng-sequence-proposals.sql
  ```
- [ ] Apply hardening constraints:
  ```bash
  psql $DATABASE_URL -f database/migrations/2025-09-22-proposals-hardening.sql
  ```
- [ ] Verify tables created:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('eng_sequence_proposals', 'execution_order_snapshots');
  ```

### GitHub Configuration
- [ ] Set required **Variables** (Settings → Variables → Actions):
  ```bash
  gh variable set ENABLE_PROD_INGEST -b "1"
  gh variable set ENABLE_PROD_BULK_ACCEPT -b "1"
  gh variable set APPLY_WSJF_PROD -b "1"
  gh variable set PROD_WRITE_OK -b "0"  # Keep at 0 until ready for production
  ```

### Verify Pipeline Components
- [ ] WSJF analysis SQL patched and working
- [ ] All 3 workflows present in `.github/workflows/`:
  - [ ] `wsjf-proposals-ingest.yml`
  - [ ] `wsjf-bulk-accept.yml`
  - [ ] `wsjf-apply-proposals.yml`
- [ ] Concurrency groups aligned (`wsjf-pipeline-*`)

---

## 🧪 Dry-Run Testing Phase

### Step 1: Test WSJF Analysis
```bash
# Verify WSJF produces recommendations
gh workflow run "WSJF Recommendations (Prod, Read-Only)"
# Check artifacts for wsjf_recommendations.csv
```

### Step 2: Dry-Run Ingest
```bash
gh workflow run "WSJF Proposals Ingest (Prod)" -f dry_run=true -f max_move=3
```
- [ ] Check workflow summary for proposal count
- [ ] Verify violations are filtered
- [ ] Download artifacts and review proposals.json

### Step 3: Dry-Run Accept
```bash
gh workflow run "WSJF Bulk-Accept (Prod)" -f dry_run=true -f per_venture_limit=1 -f max_delta=2
```
- [ ] Review candidates.csv in artifacts
- [ ] Verify acceptance criteria applied correctly
- [ ] Check that high-impact proposals selected

### Step 4: Dry-Run Apply
```bash
gh workflow run "WSJF Apply Accepted Proposals (Prod)" -f dry_run=true -f confirm=PREVIEW
```
- [ ] Review before/after snapshots
- [ ] Verify delta report shows expected changes
- [ ] Check rollback.sql generated correctly
- [ ] No actual database changes occurred

### Validation Script
Run after dry-run to verify constraints:
```bash
python3 - <<'EOF'
import csv
import sys

# Check delta constraints
with open('wsjf-apply-*/delta_report.csv', 'r') as f:
    violations = 0
    for row in csv.DictReader(f):
        if 'delta' in row and abs(int(row['delta'])) > 3:
            print(f"MAX_MOVE violation: {row['sd_id']} delta={row['delta']}")
            violations += 1

    if violations > 0:
        print(f"❌ Found {violations} MAX_MOVE violations")
        sys.exit(1)
    else:
        print("✅ All deltas within MAX_MOVE constraint")
EOF
```

---

## 🟢 Production Go-Live

### Pre-Flight Checks
- [ ] All dry-runs completed successfully
- [ ] No stale proposals detected
- [ ] Rollback script reviewed and ready
- [ ] Change window scheduled
- [ ] Stakeholders notified

### Enable Production Writes
```bash
gh variable set PROD_WRITE_OK -b "1"
```

### Step 1: Production Ingest
```bash
gh workflow run "WSJF Proposals Ingest (Prod)" -f dry_run=false -f max_move=3
```
- [ ] Verify proposals written to `eng_sequence_proposals`
- [ ] Check for any violations in workflow summary

### Step 2: Production Accept (Conservative)
```bash
gh workflow run "WSJF Bulk-Accept (Prod)" \
  -f dry_run=false \
  -f per_venture_limit=1 \
  -f max_delta=2 \
  -f min_score=0
```
- [ ] Verify accepted count in workflow summary
- [ ] Query accepted proposals:
  ```sql
  SELECT COUNT(*), AVG(ABS(delta))
  FROM eng_sequence_proposals
  WHERE status = 'accepted';
  ```

### Step 3: Production Apply (WITH CONFIRM)
```bash
# FINAL SAFETY: Must type PROMOTE
gh workflow run "WSJF Apply Accepted Proposals (Prod)" \
  -f dry_run=false \
  -f confirm=PROMOTE
```
- [ ] Monitor workflow execution
- [ ] Verify snapshots created
- [ ] Check for stale rejections
- [ ] Review audit PR created

---

## ✅ Post-Apply Verification

### Database Checks
```sql
-- Verify no duplicate execution_order
SELECT execution_order, COUNT(*)
FROM strategic_directives_v2
WHERE execution_order IS NOT NULL
GROUP BY execution_order
HAVING COUNT(*) > 1;

-- Check applied proposals
SELECT status, COUNT(*)
FROM eng_sequence_proposals
GROUP BY status;

-- Review stale proposals
SELECT * FROM v_stale_proposals WHERE freshness = 'stale';
```

### Verify Improvements
```bash
# Re-run WSJF to see improved metrics
gh workflow run "WSJF Recommendations (Prod, Read-Only)"
```
- [ ] Compare new WSJF scores to baseline
- [ ] Check reduction in blocking dependencies
- [ ] Verify critical path improvements

### Documentation
- [ ] Merge audit PR
- [ ] Update change log
- [ ] Tag release: `git tag wsjf-apply-$(date +%Y%m%d)`
- [ ] Update next rotation date in SECURITY_CREDENTIALS.md

---

## 🔄 Rollback Procedure (If Needed)

### Option 1: Use Generated Rollback Script
```bash
# Find rollback.sql in audit/wsjf/{run_id}/
psql $DATABASE_URL -f audit/wsjf/{run_id}/rollback.sql
```

### Option 2: Restore from Snapshot
```sql
BEGIN;

-- Restore from before snapshot
UPDATE strategic_directives_v2 s
SET execution_order = snap.execution_order
FROM execution_order_snapshots snap
WHERE s.id = snap.sd_id
  AND snap.snapshot_run_id = '{RUN_ID}'::uuid
  AND snap.snapshot_type = 'before';

-- Mark snapshot as used for rollback
UPDATE execution_order_snapshots
SET rollback_applied = true,
    rollback_applied_at = now()
WHERE snapshot_run_id = '{RUN_ID}'::uuid;

COMMIT;
```

### Post-Rollback
- [ ] Mark proposals as 'rejected' with reason 'rollback'
- [ ] Create incident report
- [ ] Analyze root cause
- [ ] Update procedures

---

## 📊 Success Metrics

### Immediate (Day 1)
- [ ] Zero duplicate execution_order values
- [ ] All accepted proposals applied successfully
- [ ] Stale rejection rate < 5%
- [ ] No system errors during apply

### Short-term (Week 1)
- [ ] Reduced average cycle time by X%
- [ ] Decreased blocked items by Y%
- [ ] Improved WSJF scores for critical path

### Long-term (Month 1)
- [ ] Increased throughput
- [ ] Better dependency management
- [ ] Stakeholder satisfaction with sequencing

---

## 📞 Escalation Contacts

| Role | Contact | When to Escalate |
|------|---------|------------------|
| Database Admin | [Contact] | Connection issues, rollback needed |
| Security Team | [Contact] | Credential exposure, unauthorized access |
| Product Owner | [Contact] | Business impact decisions |
| DevOps Lead | [Contact] | GitHub Actions issues |

---

## 🎯 Quick Command Reference

```bash
# Full pipeline (production)
gh workflow run "WSJF Proposals Ingest (Prod)" -f dry_run=false
gh workflow run "WSJF Bulk-Accept (Prod)" -f dry_run=false -f per_venture_limit=1
gh workflow run "WSJF Apply Accepted Proposals (Prod)" -f dry_run=false -f confirm=PROMOTE

# Monitor proposals
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM eng_sequence_proposals GROUP BY status;"

# Check for staleness
psql $DATABASE_URL -c "SELECT * FROM v_stale_proposals WHERE freshness != 'fresh';"

# Emergency stop
gh variable set PROD_WRITE_OK -b "0"
```

---

*Last Updated: 2025-09-22*
*Pipeline Version: 1.0.0*
*Owner: Platform Engineering Team*