# Production Promotion Preflight Checklist

## Pre-Promotion Verification

**Date/Time**: _______________
**Operator**: _______________
**Approver**: Chairman

### System Readiness

- [ ] **Staging CI GREEN** on latest `main` commit
  - Run ID: _______________
  - Commit SHA: _______________
  - All steps passed

- [ ] **Production Secrets Configured**
  - [ ] `PGHOST_PROD` set
  - [ ] `PGPORT_PROD` set
  - [ ] `PGDATABASE_PROD` set
  - [ ] `PGUSER_PROD` set
  - [ ] `PGPASSWORD_PROD` set

### Safety Checks

- [ ] **Maintenance Window**
  - Start: _______________
  - End: _______________
  - On-call acknowledged: _______________

- [ ] **Backup Verification**
  - Schema backup path: `ops/audit/prod_schema_before_*.sql`
  - Disk space available: _____ GB
  - Restore tested: YES / NO

- [ ] **Boundary Tripwire Clean**
  - No venture → governance writes detected
  - No venture → eng schema writes detected
  - Last check: _______________

### Change Management

- [ ] **Change Ticket**
  - Ticket #: _______________
  - Description: _______________
  - Rollback plan documented
  - Stakeholders notified

- [ ] **Impact Assessment**
  - Tables affected: _______________
  - Views affected: _______________
  - Downtime expected: NONE / _____ minutes

### Ingest Configuration

- [ ] **Ingest Behavior** (choose one)
  - [ ] Leave disabled (manual control)
  - [ ] Enable at 10% (gradual ramp)
  - [ ] Enable at 100% (full deployment)
  - [ ] Controlled elsewhere

### Final Checks (T-5 minutes)

- [ ] No active database locks
- [ ] No long-running queries
- [ ] Application traffic normal
- [ ] Monitoring dashboard ready

## GO/NO-GO Decision

**Decision**: GO / NO-GO
**Time**: _______________
**Signed**: Chairman _______________

### If GO

Execute:
```bash
gh workflow run housekeeping-prod-promotion.yml -f confirm=PROMOTE
```

Monitor:
- Workflow run: https://github.com/rickfelix/EHG_Engineer/actions
- Audit PR: (will be created automatically)

### If NO-GO

1. Document reason: _______________
2. Reschedule for: _______________
3. Notify stakeholders

## Post-Promotion Verification

- [ ] Workflow completed successfully
- [ ] VERIFY objects passed
- [ ] VERIFY RLS passed
- [ ] Audit PR created
- [ ] No errors in logs
- [ ] Application health check passed

## Notes

_______________
_______________
_______________

---

**Quick Reference**

- Staging workflow: `housekeeping-staging-selfcontained.yml`
- Production workflow: `housekeeping-prod-promotion.yml`
- Rollback procedure: See `ops/runbooks/prod_rollback.md`
- Emergency contact: On-call engineer via PagerDuty