# Stage 1: Metrics & Monitoring

## Key Performance Indicators

| Metric | Definition | Target Threshold | Current Status | Source |
|--------|------------|------------------|----------------|--------|
| Idea Quality Score | AI-generated 0-100 score | ≥70 (proposed) | ⚠️ Not implemented | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:15 |
| Validation Completeness | % of required fields filled | 100% | ✅ Enforced by UI gates | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:20-23 |
| Time to Capture | Seconds from start to save | <120s (proposed) | ❓ Not tracked | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:17 |

**Evidence**: Metrics listed in stages.yaml lines 14-17, but thresholds are proposed (not in YAML)

## Monitoring Queries (Proposed)

```sql
-- Average time in Stage 1 (approximation using created_at)
SELECT
  AVG(EXTRACT(EPOCH FROM (created_at - created_at))) as avg_seconds
FROM ventures
WHERE current_workflow_stage = 1;

-- Completion rate (Stage 1 → Stage 2)
SELECT
  COUNT(CASE WHEN current_workflow_stage >= 2 THEN 1 END) * 100.0 / COUNT(*) as completion_rate
FROM ventures
WHERE created_at > NOW() - INTERVAL '30 days';
```

**Note**: Queries are PROPOSED, not implemented. No monitoring infrastructure found in codebase.

## Alert Conditions (Proposed)

| Condition | Severity | Action |
|-----------|----------|--------|
| Idea Quality Score < 50 | WARNING | Notify Chairman for early rejection |
| Time to Capture > 300s | INFO | UX improvement opportunity |
| Validation Completeness < 100% | CRITICAL | Block progression to Stage 2 |

**Status**: Proposed - no alerting system found

## Dashboard Specifications (Proposed)

**Stage 1 Health Dashboard** (not implemented):
1. **Panel**: Ideas created today/week/month (line chart)
2. **Panel**: Quality score distribution (histogram) — BLOCKED: metric not implemented
3. **Panel**: Validation completeness rate (gauge, target 100%)
4. **Panel**: Average time to capture (trend line, target <120s) — BLOCKED: not tracked

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Metrics list | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 14-17 |
| Exit gates (validation) | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 20-23 |
