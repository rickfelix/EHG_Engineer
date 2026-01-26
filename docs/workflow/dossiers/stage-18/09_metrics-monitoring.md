# Stage 18: Metrics and Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, authentication, sd

## Purpose

This document provides SQL queries, monitoring dashboards, and alerting thresholds for tracking Stage 18 (Documentation Sync to GitHub) health and performance.

**Key Metrics** (from stages.yaml):
1. Sync completeness (target: ≥95%)
2. Documentation coverage (target: ≥80%)
3. Version control compliance (target: 100%)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:794-797 "Sync completeness, Documentation coverage, Version control compliance"

## Metric 1: Sync Completeness

### Definition

**Formula**: (Files successfully pushed to GitHub / Total files in venture directory) × 100%

**Target**: ≥95% (allows 5% for intentionally excluded files)

**Measurement Frequency**: Immediate (post-Stage 18 execution), then daily via CI/CD

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:795 "Sync completeness"

### SQL Query (Metric Calculation)

```sql
-- Calculate sync completeness for a venture
WITH file_counts AS (
  SELECT
    venture_id,
    total_files,
    synced_files,
    (synced_files::FLOAT / NULLIF(total_files, 0)) * 100 AS sync_completeness
  FROM stage_18_sync_metrics
  WHERE venture_id = 'VENTURE-001'
  ORDER BY measured_at DESC
  LIMIT 1  -- Get most recent measurement
)
SELECT
  venture_id,
  total_files,
  synced_files,
  ROUND(sync_completeness, 2) AS sync_completeness_pct,
  CASE
    WHEN sync_completeness >= 95 THEN 'Pass'
    WHEN sync_completeness >= 90 THEN 'Warning'
    ELSE 'Fail'
  END AS status
FROM file_counts;
```

**Expected Output**:
```
venture_id   | total_files | synced_files | sync_completeness_pct | status
-------------|-------------|--------------|----------------------|-------
VENTURE-001  | 150         | 148          | 98.67                | Pass
```

### SQL Query (Historical Trend)

```sql
-- Track sync completeness over time (last 30 days)
SELECT
  DATE(measured_at) AS measurement_date,
  venture_id,
  ROUND(AVG(sync_completeness), 2) AS avg_sync_completeness,
  MIN(sync_completeness) AS min_sync_completeness,
  MAX(sync_completeness) AS max_sync_completeness
FROM stage_18_sync_metrics
WHERE venture_id = 'VENTURE-001'
  AND measured_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(measured_at), venture_id
ORDER BY measurement_date DESC;
```

**Expected Output**:
```
measurement_date | venture_id  | avg_sync_completeness | min | max
-----------------|-------------|-----------------------|-----|-----
2025-11-05       | VENTURE-001 | 98.67                 | 98  | 99
2025-11-04       | VENTURE-001 | 97.50                 | 96  | 98
2025-11-03       | VENTURE-001 | 98.00                 | 97  | 99
```

### SQL Query (Alert Trigger)

```sql
-- Find ventures below sync completeness threshold (trigger recursion)
SELECT
  venture_id,
  sync_completeness,
  total_files - synced_files AS missing_files,
  measured_at
FROM stage_18_sync_metrics
WHERE sync_completeness < 95  -- Threshold
  AND measured_at >= NOW() - INTERVAL '24 hours'
ORDER BY sync_completeness ASC;

-- If returned rows > 0, trigger SYNC-001 recursion (see 07_recursion-blueprint.md)
```

**Expected Output** (if issues exist):
```
venture_id   | sync_completeness | missing_files | measured_at
-------------|-------------------|---------------|-------------
VENTURE-002  | 92.30             | 10            | 2025-11-05 14:23:00
VENTURE-005  | 88.00             | 18            | 2025-11-05 13:15:00
```

### Dashboard Visualization

**Widget Type**: Gauge Chart
**Display**:
- Green zone: 95-100% (Pass)
- Yellow zone: 90-94% (Warning)
- Red zone: <90% (Fail)

**Sample Query** (for dashboard):
```sql
-- Current sync completeness for all ventures
SELECT
  venture_id,
  venture_name,
  sync_completeness,
  measured_at
FROM stage_18_sync_metrics sm
JOIN ventures v USING (venture_id)
WHERE sm.measured_at = (
  SELECT MAX(measured_at)
  FROM stage_18_sync_metrics
  WHERE venture_id = sm.venture_id
)
ORDER BY sync_completeness ASC;
```

## Metric 2: Documentation Coverage

### Definition

**Formula**: (Documented APIs/components / Total APIs/components) × 100%

**Target**: ≥80%

**Measurement Method**: Static analysis (JSDoc coverage for JavaScript, docstrings for Python)

**Measurement Frequency**: Daily via CI/CD pipeline

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:796 "Documentation coverage"

### SQL Query (Metric Calculation)

```sql
-- Calculate documentation coverage for a venture
WITH coverage_stats AS (
  SELECT
    venture_id,
    COUNT(*) AS total_components,
    COUNT(*) FILTER (WHERE has_documentation = true) AS documented_components,
    (COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100 AS coverage_pct
  FROM api_components  -- Or functions, classes, endpoints
  WHERE venture_id = 'VENTURE-001'
  GROUP BY venture_id
)
SELECT
  venture_id,
  total_components,
  documented_components,
  ROUND(coverage_pct, 2) AS documentation_coverage_pct,
  CASE
    WHEN coverage_pct >= 80 THEN 'Pass'
    WHEN coverage_pct >= 70 THEN 'Warning'
    ELSE 'Fail'
  END AS status
FROM coverage_stats;
```

**Expected Output**:
```
venture_id   | total_components | documented_components | coverage_pct | status
-------------|------------------|-----------------------|--------------|-------
VENTURE-001  | 50               | 43                    | 86.00        | Pass
```

**Note**: Requires populating `api_components` table via static analysis tool (e.g., JSDoc parser, Python AST analyzer).

### SQL Query (Coverage by Component Type)

```sql
-- Break down coverage by component type (API endpoints, classes, functions)
SELECT
  venture_id,
  component_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE has_documentation = true) AS documented,
  ROUND((COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS coverage_pct
FROM api_components
WHERE venture_id = 'VENTURE-001'
GROUP BY venture_id, component_type
ORDER BY coverage_pct ASC;
```

**Expected Output**:
```
venture_id   | component_type | total | documented | coverage_pct
-------------|----------------|-------|------------|-------------
VENTURE-001  | api_endpoint   | 20    | 18         | 90.00
VENTURE-001  | class          | 15    | 12         | 80.00
VENTURE-001  | function       | 15    | 13         | 86.67
```

**Use Case**: Identify which component types need more documentation (focus on lowest coverage_pct).

### SQL Query (Alert Trigger)

```sql
-- Find ventures below documentation coverage threshold (trigger recursion)
SELECT
  venture_id,
  ROUND((COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS coverage_pct,
  COUNT(*) - COUNT(*) FILTER (WHERE has_documentation = true) AS undocumented_count
FROM api_components
WHERE venture_id IN (SELECT DISTINCT venture_id FROM ventures WHERE stage_18_status = 'completed')
GROUP BY venture_id
HAVING (COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100 < 80
ORDER BY coverage_pct ASC;

-- If returned rows > 0, trigger SYNC-002 recursion (see 07_recursion-blueprint.md)
```

**Expected Output** (if issues exist):
```
venture_id   | coverage_pct | undocumented_count
-------------|--------------|-------------------
VENTURE-003  | 72.50        | 11
VENTURE-007  | 65.00        | 21
```

### Dashboard Visualization

**Widget Type**: Horizontal Bar Chart
**Display**:
- X-axis: Documentation coverage (0-100%)
- Y-axis: Venture ID
- Color: Green (≥80%), Yellow (70-79%), Red (<70%)

**Sample Query** (for dashboard):
```sql
-- Documentation coverage for all ventures (top 10 lowest)
SELECT
  v.venture_id,
  v.venture_name,
  ROUND((COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS coverage_pct
FROM api_components ac
JOIN ventures v USING (venture_id)
WHERE v.stage_18_status = 'completed'
GROUP BY v.venture_id, v.venture_name
ORDER BY coverage_pct ASC
LIMIT 10;
```

## Metric 3: Version Control Compliance

### Definition

**Formula**: (Commits with conventional messages / Total commits) × 100%

**Target**: 100%

**Conventional Commit Format**: `type(scope): description`
- **Types**: feat, fix, docs, style, refactor, test, chore
- **Example**: `feat(api): add user authentication endpoint`

**Measurement Frequency**: Per commit (via Git hook), daily aggregate

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:797 "Version control compliance"

### SQL Query (Metric Calculation)

```sql
-- Calculate version control compliance for a venture (last 7 days)
WITH commit_compliance AS (
  SELECT
    venture_id,
    COUNT(*) AS total_commits,
    COUNT(*) FILTER (WHERE
      commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
    ) AS compliant_commits,
    (COUNT(*) FILTER (WHERE
      commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
    )::FLOAT / NULLIF(COUNT(*), 0)) * 100 AS compliance_pct
  FROM git_commits
  WHERE venture_id = 'VENTURE-001'
    AND committed_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY venture_id
)
SELECT
  venture_id,
  total_commits,
  compliant_commits,
  ROUND(compliance_pct, 2) AS compliance_pct,
  CASE
    WHEN compliance_pct = 100 THEN 'Pass'
    WHEN compliance_pct >= 90 THEN 'Warning'
    ELSE 'Fail'
  END AS status
FROM commit_compliance;
```

**Expected Output**:
```
venture_id   | total_commits | compliant_commits | compliance_pct | status
-------------|---------------|-------------------|----------------|-------
VENTURE-001  | 25            | 25                | 100.00         | Pass
```

### SQL Query (Non-Compliant Commits)

```sql
-- List non-compliant commits (for manual review or rewrite)
SELECT
  venture_id,
  commit_sha,
  commit_message,
  committed_by,
  committed_at
FROM git_commits
WHERE venture_id = 'VENTURE-001'
  AND committed_at >= CURRENT_DATE - INTERVAL '7 days'
  AND commit_message !~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
ORDER BY committed_at DESC;
```

**Expected Output** (if non-compliant commits exist):
```
venture_id   | commit_sha | commit_message | committed_by | committed_at
-------------|------------|----------------|--------------|-------------
VENTURE-001  | abc123     | wip            | dev-user     | 2025-11-04 15:30:00
VENTURE-001  | def456     | fix bug        | dev-user     | 2025-11-03 10:15:00
```

**Use Case**: Identify commits that need message rewrite (via interactive rebase).

### SQL Query (Alert Trigger)

```sql
-- Find ventures with <100% compliance (trigger SYNC-004 recursion)
SELECT
  venture_id,
  ROUND((COUNT(*) FILTER (WHERE
    commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
  )::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS compliance_pct,
  COUNT(*) - COUNT(*) FILTER (WHERE
    commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
  ) AS non_compliant_count
FROM git_commits
WHERE committed_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY venture_id
HAVING (COUNT(*) FILTER (WHERE
  commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
)::FLOAT / NULLIF(COUNT(*), 0)) * 100 < 100
ORDER BY compliance_pct ASC;

-- If returned rows > 0, trigger SYNC-004 recursion (see 07_recursion-blueprint.md)
```

**Expected Output** (if issues exist):
```
venture_id   | compliance_pct | non_compliant_count
-------------|----------------|--------------------
VENTURE-004  | 95.00          | 2
VENTURE-006  | 88.00          | 6
```

### Dashboard Visualization

**Widget Type**: Timeline Chart
**Display**:
- X-axis: Date
- Y-axis: Compliance percentage (0-100%)
- Line: Rolling 7-day compliance rate

**Sample Query** (for dashboard):
```sql
-- Daily version control compliance (last 30 days)
SELECT
  DATE(committed_at) AS commit_date,
  venture_id,
  COUNT(*) AS total_commits,
  ROUND((COUNT(*) FILTER (WHERE
    commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'
  )::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS compliance_pct
FROM git_commits
WHERE venture_id = 'VENTURE-001'
  AND committed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(committed_at), venture_id
ORDER BY commit_date DESC;
```

## Operational Metrics (Stage 18 Performance)

### Metric 4: Stage 18 Execution Time

**Definition**: Time from Stage 18 start to completion (all 3 substages)

**Target**: <4 hours (automated), <18 hours (manual)

**Measurement**: Database timestamps (stage_started_at, stage_completed_at)

**Evidence**: See 02_stage-map.md for execution time estimates

**SQL Query**:
```sql
-- Average Stage 18 execution time (last 10 ventures)
SELECT
  AVG(stage_18_completed_at - stage_18_started_at) AS avg_execution_time,
  MIN(stage_18_completed_at - stage_18_started_at) AS min_execution_time,
  MAX(stage_18_completed_at - stage_18_started_at) AS max_execution_time
FROM ventures
WHERE stage_18_status = 'completed'
  AND stage_18_completed_at >= CURRENT_DATE - INTERVAL '90 days'
LIMIT 10;
```

**Expected Output**:
```
avg_execution_time | min_execution_time | max_execution_time
-------------------|--------------------|-----------------
03:45:00           | 02:30:00           | 06:15:00
```

**Alert Threshold**: Execution time >6 hours (investigate delays).

### Metric 5: Stage 18 Success Rate

**Definition**: (Successful Stage 18 completions / Total Stage 18 attempts) × 100%

**Target**: >90%

**SQL Query**:
```sql
-- Stage 18 success rate (last 90 days)
SELECT
  COUNT(*) FILTER (WHERE stage_18_status = 'completed') AS successful,
  COUNT(*) FILTER (WHERE stage_18_status IN ('failed', 'blocked')) AS failed,
  COUNT(*) AS total_attempts,
  ROUND((COUNT(*) FILTER (WHERE stage_18_status = 'completed')::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS success_rate_pct
FROM ventures
WHERE stage_18_started_at >= CURRENT_DATE - INTERVAL '90 days';
```

**Expected Output**:
```
successful | failed | total_attempts | success_rate_pct
-----------|--------|----------------|------------------
45         | 5      | 50             | 90.00
```

**Alert Threshold**: Success rate <80% (investigate root causes).

### Metric 6: Recursion Frequency

**Definition**: Count of recursion triggers per venture (SYNC-001, SYNC-002, etc.)

**Target**: <3 recursions per venture (indicates healthy sync process)

**SQL Query**:
```sql
-- Recursion frequency by trigger type (last 30 days)
SELECT
  trigger_type,
  COUNT(*) AS trigger_count,
  COUNT(DISTINCT venture_id) AS affected_ventures,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - triggered_at)) / 3600), 2) AS avg_resolution_hours
FROM stage_18_recursion_triggers
WHERE triggered_at >= CURRENT_DATE - INTERVAL '30 days'
  AND recursion_status = 'completed'
GROUP BY trigger_type
ORDER BY trigger_count DESC;
```

**Expected Output**:
```
trigger_type | trigger_count | affected_ventures | avg_resolution_hours
-------------|---------------|-------------------|-----------------------
SYNC-001     | 8             | 5                 | 1.25
SYNC-002     | 4             | 3                 | 2.50
SYNC-003     | 2             | 2                 | 3.00
```

**Alert Threshold**: >10 SYNC-001 triggers in 30 days (systematic sync issues).

**Evidence**: See 07_recursion-blueprint.md for recursion triggers.

## Alerting Configuration

### Alert 1: Sync Completeness Below Threshold

**Condition**: `sync_completeness < 95%`
**Severity**: Warning (if 90-94%), Critical (if <90%)
**Notification**: Email to EXEC agent + Slack #stage-18-alerts
**Action**: Trigger SYNC-001 recursion (automatic)

**SQL Query** (alert check, runs hourly):
```sql
SELECT venture_id, sync_completeness
FROM stage_18_sync_metrics
WHERE sync_completeness < 95
  AND measured_at >= NOW() - INTERVAL '1 hour';
```

### Alert 2: Documentation Coverage Below Threshold

**Condition**: `documentation_coverage < 80%`
**Severity**: Warning (if 70-79%), Critical (if <70%)
**Notification**: Email to PLAN agent (responsible for docs) + Slack #documentation
**Action**: Trigger SYNC-002 recursion (automatic)

**SQL Query** (alert check, runs daily):
```sql
SELECT venture_id,
       ROUND((COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS coverage_pct
FROM api_components
GROUP BY venture_id
HAVING (COUNT(*) FILTER (WHERE has_documentation = true)::FLOAT / NULLIF(COUNT(*), 0)) * 100 < 80;
```

### Alert 3: CI/CD Pipeline Failures

**Condition**: `>3 consecutive failures` for any workflow
**Severity**: Critical
**Notification**: Email to EXEC agent + Slack #ci-cd-alerts + PagerDuty
**Action**: Trigger SYNC-003 recursion (automatic)

**SQL Query** (alert check, runs hourly):
```sql
WITH recent_runs AS (
  SELECT venture_id, workflow_name, status,
         ROW_NUMBER() OVER (PARTITION BY venture_id, workflow_name ORDER BY run_at DESC) AS run_rank
  FROM cicd_pipeline_runs
  WHERE run_at >= NOW() - INTERVAL '24 hours'
)
SELECT venture_id, workflow_name, COUNT(*) AS consecutive_failures
FROM recent_runs
WHERE run_rank <= 3 AND status = 'failure'
GROUP BY venture_id, workflow_name
HAVING COUNT(*) = 3;
```

### Alert 4: Version Control Compliance Drop

**Condition**: `compliance < 100%`
**Severity**: Warning (if 90-99%), Critical (if <90%)
**Notification**: Email to EXEC agent + Slack #git-compliance
**Action**: Send training email to committers (not automatic recursion, human judgment required)

**SQL Query** (alert check, runs daily):
```sql
SELECT venture_id,
       ROUND((COUNT(*) FILTER (WHERE commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+')::FLOAT / NULLIF(COUNT(*), 0)) * 100, 2) AS compliance_pct
FROM git_commits
WHERE committed_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY venture_id
HAVING (COUNT(*) FILTER (WHERE commit_message ~ '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+')::FLOAT / NULLIF(COUNT(*), 0)) * 100 < 100;
```

### Alert 5: Stage 18 Execution Timeout

**Condition**: `execution_time > 6 hours`
**Severity**: Critical
**Notification**: Email to EXEC agent + Slack #stage-18-alerts
**Action**: Investigate delays (network issues, large files, GitHub API rate limits)

**SQL Query** (alert check, runs hourly):
```sql
SELECT venture_id,
       stage_18_started_at,
       NOW() - stage_18_started_at AS elapsed_time
FROM ventures
WHERE stage_18_status = 'in_progress'
  AND NOW() - stage_18_started_at > INTERVAL '6 hours';
```

## Dashboard Layout

**Dashboard Name**: Stage 18 Sync Health
**Refresh Frequency**: Every 5 minutes (real-time monitoring)

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│                    STAGE 18 SYNC HEALTH                      │
├─────────────────────────────────────────────────────────────┤
│  Sync Completeness  │  Documentation Coverage  │  VC Compliance │
│      98.5%          │         85.0%             │    100.0%      │
│  [Gauge: Green]     │  [Gauge: Green]           │ [Gauge: Green] │
├─────────────────────────────────────────────────────────────┤
│  Stage 18 Execution Time (Last 10 Ventures)                  │
│  [Bar Chart: avg 3.5 hrs, min 2.5 hrs, max 6 hrs]            │
├─────────────────────────────────────────────────────────────┤
│  Recursion Triggers (Last 30 Days)                           │
│  [Pie Chart: SYNC-001: 8, SYNC-002: 4, SYNC-003: 2]          │
├─────────────────────────────────────────────────────────────┤
│  Ventures Below Thresholds (Critical Attention)              │
│  [Table: venture_id, metric, value, threshold, action]       │
└─────────────────────────────────────────────────────────────┘
```

**Dashboard Access**: EXEC agents (primary), LEAD agents (oversight), PLAN agents (documentation metrics)

---

**Next Steps**: Proceed to 10_gaps-backlog.md for Strategic Directive proposals.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
