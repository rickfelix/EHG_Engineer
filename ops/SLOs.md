# Housekeeping SLOs

## Service Level Objectives

### SLOs
- **Staging pipeline success rate** ≥ 99% (rolling 30d)
- **Staging runtime** p50 ≤ 60s; p95 ≤ 120s
- **Drift detection MTTR** ≤ 1 business day
- **Change failure rate** (prod promotion) ≤ 5%; rollback MTTR ≤ 30 min

### Alerts (open an issue + Slack notify)
- Staging fails 2 consecutive runs
- Drift detection finds schema variance on `eng_*` or `vh_*`
- Boundary tripwire or RLS verify fails on any branch
- File-size/length strict checks fail on `main`

## Runbooks

### Staging Failure
1. Check Actions logs → identify root cause
2. Fix issue in feature branch
3. Re-run staging workflow
4. Append audit note to `ops/audit/2025-09-22.md`

### Schema Drift Detected
1. Confirm diff in weekly report PR
2. Open fix PR with corrective migrations
3. Re-run staging validation
4. Merge after validation passes
5. Close drift issue with resolution notes

### Boundary/RLS Fail
1. **BLOCK MERGE** immediately
2. Fix schema/policies in feature branch
3. Re-verify with staging CI
4. Only merge after all checks pass

### Production Rollback
1. Use `ops/audit/prod_schema_before.sql` (schema-only backup)
2. Revert last promotion PR
3. Re-run staging validation
4. Open post-incident note with:
   - Timeline
   - Root cause
   - Corrective actions
   - Prevention measures

## Monitoring Dashboard

### Key Metrics
```yaml
staging_success_rate:
  target: 0.99
  measurement: success_runs / total_runs (30d)

staging_runtime_p50:
  target: 60s
  measurement: median(runtime) (7d)

drift_detection_mttr:
  target: 1d
  measurement: time_to_close drift issues

change_failure_rate:
  target: 0.05
  measurement: failed_promotions / total_promotions (30d)
```

### Health Indicators
- 🟢 Green: All SLOs met
- 🟡 Yellow: 1 SLO at risk (>90% of target)
- 🔴 Red: Any SLO breached

## Escalation Path
1. **L1:** GitHub Actions failure → Auto-retry once
2. **L2:** 2+ consecutive failures → Create issue, notify #eng-oncall
3. **L3:** Production impact → Page on-call engineer, start incident

## Review Cycle
- **Weekly:** Review staging success rate
- **Monthly:** Review all SLOs and adjust targets
- **Quarterly:** Full SLO review with stakeholders

---

**Last Updated:** 2025-09-22
**Owner:** Platform Engineering
**Review:** Monthly