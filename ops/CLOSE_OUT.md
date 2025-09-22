# Housekeeping Close-Out Checklist

## Release & Documentation
- [x] **Tag created:** `housekeeping-2025-09-22`
- [x] **Release notes posted** on GitHub
- [x] **Concurrency controls** added to workflows
- [x] **TypeScript support** added with build pipeline
- [x] **Telemetry & dry-run** implemented

## CI/CD Infrastructure
- [x] **Self-contained staging** with ephemeral PostgreSQL
- [x] **Production promotion** with safety gates
- [x] **File size enforcement** (900 lines for code, 2000 for docs)
- [x] **Schema drift detection** with weekly reports
- [x] **Daily automation** (03:00 UTC)

## Code Quality
- [x] **Database loader refactored** (1503 → 6 modules)
- [x] **Backward compatibility** maintained (100%)
- [x] **Zero breaking changes**
- [x] **Shim layer** preserves all exports

## Security & Governance
- [ ] **CODEOWNERS** enforced for `db/**`, workflows, and `ops/**`
- [ ] **Secrets rotation reminder** scheduled (every 90 days) for prod DB creds
- [ ] **Kill switch var** (`HOUSEKEEPING_KILL_SWITCH`) documented for emergency stop

## Maintenance Schedule
- [ ] **Budgets/allowlist** reviewed quarterly (`ops/ci/bloat-allowlist.txt`)
- [ ] **Weekly report** PR merges cleanly; drift issues auto-create tickets
- [ ] **Monolith detection** thresholds reviewed monthly

## Operational Commands

### Daily Staging (Automatic)
```bash
# Runs at 03:00 UTC daily
# Manual trigger:
gh workflow run housekeeping-staging-selfcontained.yml
```

### Production Promotion
```bash
# Requires explicit confirmation
gh workflow run housekeeping-prod-promotion.yml -f confirm=PROMOTE
```

### Local Testing
```bash
# Test with dry-run (no DB operations)
node scripts/test-dry-run.js --dry-run

# Build TypeScript modules
npm run build:loader

# Run with telemetry
node scripts/test-dry-run.js
```

## Emergency Procedures

### Rollback Production
1. Restore schema: `psql $DATABASE_URL < ops/audit/prod_schema_before.sql`
2. Re-run last known good promotion
3. Review audit log: `ops/audit/2025-09-22.md`

### Stop All Automation
```bash
# Set kill switch in repository secrets
gh secret set HOUSEKEEPING_KILL_SWITCH --body "true"
```

### Debug Failures
```bash
# View staging run logs
gh run list --workflow=housekeeping-staging-selfcontained.yml --limit 5

# Check specific run
gh run view [RUN_ID] --log-failed
```

## Verification Evidence
- ✅ Staging CI: [Run #17921775477](https://github.com/rickfelix/EHG_Engineer/actions/runs/17921775477)
- ✅ Release: [housekeeping-2025-09-22](https://github.com/rickfelix/EHG_Engineer/releases/tag/housekeeping-2025-09-22)
- ✅ PRs Merged: #4 (refactor), #5 (telemetry), #6 (TypeScript)

## Next Quarter Goals
- [ ] Add pgTAP tests for schema invariants
- [ ] Implement budgets.yml for configurable thresholds
- [ ] Pin Actions by SHA for supply chain security
- [ ] Add Slack notifications for prod promotions
- [ ] Create dashboard for telemetry metrics

---

**Last Updated**: 2025-09-22
**Owner**: Engineering Team
**Review Cycle**: Quarterly