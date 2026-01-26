# Stage 25: Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, e2e, unit, directive

## Overview

**Purpose**: Define KPIs, Supabase queries, and dashboards for monitoring Stage 25 (Quality Assurance) execution.

**Key Metrics** (from stages.yaml):
1. Test coverage (unit, integration, E2E)
2. Defect density (bugs per 1000 LOC)
3. Quality score (composite 0-100)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1116-1119

---

## Stage 25 KPIs

### KPI 1: Test Coverage Percentage

**Definition**: % of code covered by automated tests (unit, integration, E2E)

**Formula**:
- **Unit Coverage**: `(lines_covered_by_unit_tests / total_lines_of_code) × 100`
- **Integration Coverage**: `(endpoints_tested / total_endpoints) × 100`
- **E2E Coverage**: `(critical_flows_tested / total_critical_flows) × 100`

**Target**: Unit ≥80%, Integration ≥70%, E2E ≥50% (global default)

**Supabase Query**:
```sql
SELECT venture_id,
       test_type,
       coverage_percentage,
       CASE
           WHEN test_type = 'unit' AND coverage_percentage >= 80 THEN '✅ PASS'
           WHEN test_type = 'integration' AND coverage_percentage >= 70 THEN '✅ PASS'
           WHEN test_type = 'e2e' AND coverage_percentage >= 50 THEN '✅ PASS'
           ELSE '❌ FAIL'
       END AS status,
       executed_at
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001'
ORDER BY executed_at DESC, test_type;
```

**Expected Output**:
```
venture_id  | test_type    | coverage_percentage | status    | executed_at
------------|--------------|---------------------|-----------|-------------------------
VENTURE-001 | unit         | 85.3                | ✅ PASS   | 2025-11-06 10:30:00+00
VENTURE-001 | integration  | 72.1                | ✅ PASS   | 2025-11-06 10:35:00+00
VENTURE-001 | e2e          | 55.0                | ✅ PASS   | 2025-11-06 10:45:00+00
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1117 "- Test coverage"

---

### KPI 2: Defect Density

**Definition**: Number of bugs per 1000 lines of code

**Formula**: `(total_bugs / total_lines_of_code) × 1000`

**Target**: <5 bugs per 1000 LOC (industry standard)

**Supabase Query**:
```sql
WITH bug_counts AS (
    SELECT venture_id,
           COUNT(*) AS total_bugs,
           COUNT(*) FILTER (WHERE severity = 'P0') AS p0_bugs,
           COUNT(*) FILTER (WHERE severity = 'P1') AS p1_bugs,
           COUNT(*) FILTER (WHERE severity = 'P2') AS p2_bugs
    FROM stage_25_bugs
    WHERE venture_id = 'VENTURE-001'
    GROUP BY venture_id
),
code_stats AS (
    SELECT venture_id,
           total_lines_of_code
    FROM ventures
    WHERE id = 'VENTURE-001'
)
SELECT bc.venture_id,
       bc.total_bugs,
       cs.total_lines_of_code,
       ROUND((bc.total_bugs::DECIMAL / cs.total_lines_of_code * 1000), 2) AS defect_density,
       CASE
           WHEN (bc.total_bugs::DECIMAL / cs.total_lines_of_code * 1000) < 5 THEN '✅ PASS'
           ELSE '❌ FAIL'
       END AS status
FROM bug_counts bc
JOIN code_stats cs ON bc.venture_id = cs.venture_id;
```

**Expected Output**:
```
venture_id  | total_bugs | total_lines_of_code | defect_density | status
------------|------------|---------------------|----------------|--------
VENTURE-001 | 15         | 5000                | 3.00           | ✅ PASS
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1118 "- Defect density"

---

### KPI 3: Quality Score

**Definition**: Composite score (0-100) based on test coverage, defect density, performance, UX

**Formula**:
```
Quality Score = (Test Coverage × 0.4) + (Defect Density × 0.3) + (Performance × 0.2) + (UX × 0.1)

Test Coverage = (Unit Coverage × 0.5) + (Integration Coverage × 0.3) + (E2E Coverage × 0.2)
Defect Density = MAX(0, 100 - (Defect Density Value × 10))
Performance = (API Response Time Score + Page Load Time Score) / 2
UX = Manual UX review score (0-100)
```

**Target**: ≥85/100 (release-ready)

**Supabase Query**:
```sql
SELECT venture_id,
       quality_score,
       test_coverage_score,
       defect_density_score,
       performance_score,
       ux_score,
       CASE
           WHEN quality_score >= 85 THEN '✅ PASS'
           ELSE '❌ FAIL'
       END AS status,
       calculated_at
FROM stage_25_quality_metrics
WHERE venture_id = 'VENTURE-001'
ORDER BY calculated_at DESC
LIMIT 1;
```

**Expected Output**:
```
venture_id  | quality_score | test_coverage_score | defect_density_score | performance_score | ux_score | status    | calculated_at
------------|---------------|---------------------|----------------------|-------------------|----------|-----------|-------------------------
VENTURE-001 | 88.5          | 78.5                | 85.0                 | 92.0              | 80.0     | ✅ PASS   | 2025-11-06 11:00:00+00
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1119 "- Quality score"

---

### KPI 4: Test Pass Rate

**Definition**: % of tests that passed (unit + integration + E2E)

**Formula**: `(tests_passed / (tests_passed + tests_failed)) × 100`

**Target**: 100% (all tests pass)

**Supabase Query**:
```sql
SELECT venture_id,
       SUM(tests_passed) AS total_passed,
       SUM(tests_failed) AS total_failed,
       SUM(tests_passed + tests_failed) AS total_tests,
       ROUND((SUM(tests_passed)::DECIMAL / NULLIF(SUM(tests_passed + tests_failed), 0) * 100), 2) AS pass_rate,
       CASE
           WHEN SUM(tests_failed) = 0 THEN '✅ PASS'
           ELSE '❌ FAIL'
       END AS status
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001'
GROUP BY venture_id;
```

**Expected Output**:
```
venture_id  | total_passed | total_failed | total_tests | pass_rate | status
------------|--------------|--------------|-------------|-----------|--------
VENTURE-001 | 355          | 0            | 355         | 100.00    | ✅ PASS
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1125 "- Tests passed"

---

### KPI 5: Bug Resolution Rate

**Definition**: % of bugs resolved (fixed and verified) out of total bugs

**Formula**: `(bugs_verified / total_bugs) × 100`

**Target**: 100% for P0/P1 bugs, ≥90% for P2+ bugs

**Supabase Query**:
```sql
SELECT venture_id,
       severity,
       COUNT(*) AS total_bugs,
       COUNT(*) FILTER (WHERE status = 'verified') AS bugs_verified,
       COUNT(*) FILTER (WHERE status IN ('open', 'in-progress', 'fixed')) AS bugs_open,
       ROUND((COUNT(*) FILTER (WHERE status = 'verified')::DECIMAL / COUNT(*) * 100), 2) AS resolution_rate,
       CASE
           WHEN severity IN ('P0', 'P1') AND COUNT(*) FILTER (WHERE status != 'verified') = 0 THEN '✅ PASS'
           WHEN severity NOT IN ('P0', 'P1') AND (COUNT(*) FILTER (WHERE status = 'verified')::DECIMAL / COUNT(*) * 100) >= 90 THEN '✅ PASS'
           ELSE '❌ FAIL'
       END AS status
FROM stage_25_bugs
WHERE venture_id = 'VENTURE-001'
GROUP BY venture_id, severity
ORDER BY severity;
```

**Expected Output**:
```
venture_id  | severity | total_bugs | bugs_verified | bugs_open | resolution_rate | status
------------|----------|------------|---------------|-----------|-----------------|--------
VENTURE-001 | P0       | 0          | 0             | 0         | NULL            | ✅ PASS
VENTURE-001 | P1       | 8          | 8             | 0         | 100.00          | ✅ PASS
VENTURE-001 | P2       | 7          | 7             | 0         | 100.00          | ✅ PASS
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1139 "- Fixes verified"

---

### KPI 6: Test Execution Duration

**Definition**: Time taken to execute all tests (unit + integration + E2E)

**Formula**: `SUM(test_duration_seconds)`

**Target**: <1 hour (3600 seconds) for CI/CD efficiency

**Supabase Query**:
```sql
SELECT venture_id,
       test_type,
       duration_seconds,
       ROUND(duration_seconds / 60.0, 2) AS duration_minutes,
       CASE
           WHEN test_type = 'unit' AND duration_seconds < 300 THEN '✅ PASS'
           WHEN test_type = 'integration' AND duration_seconds < 900 THEN '✅ PASS'
           WHEN test_type = 'e2e' AND duration_seconds < 1800 THEN '✅ PASS'
           ELSE '⚠️ SLOW'
       END AS status,
       executed_at
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001'
ORDER BY executed_at DESC, test_type;
```

**Expected Output**:
```
venture_id  | test_type    | duration_seconds | duration_minutes | status    | executed_at
------------|--------------|------------------|------------------|-----------|-------------------------
VENTURE-001 | unit         | 195              | 3.25             | ✅ PASS   | 2025-11-06 10:30:00+00
VENTURE-001 | integration  | 750              | 12.50            | ✅ PASS   | 2025-11-06 10:35:00+00
VENTURE-001 | e2e          | 1125             | 18.75            | ✅ PASS   | 2025-11-06 10:45:00+00
```

**Total Duration**: 195 + 750 + 1125 = 2070 seconds (34.5 minutes) ✅ PASS (<1 hour)

---

### KPI 7: Regression Count

**Definition**: Number of regressions introduced (tests that passed before, fail now)

**Formula**: `COUNT(tests WHERE baseline_status='passed' AND current_status='failed')`

**Target**: 0 (no regressions)

**Supabase Query**:
```sql
SELECT venture_id,
       COUNT(*) AS total_regressions,
       CASE
           WHEN COUNT(*) = 0 THEN '✅ PASS'
           ELSE '❌ FAIL'
       END AS status,
       MAX(regression_detected_at) AS last_regression_at
FROM stage_25_regression_results
WHERE venture_id = 'VENTURE-001'
  AND baseline_status = 'passed'
  AND current_status = 'failed'
GROUP BY venture_id;
```

**Expected Output**:
```
venture_id  | total_regressions | status    | last_regression_at
------------|-------------------|-----------|--------------------
VENTURE-001 | 0                 | ✅ PASS   | NULL
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1140 "- Regression tested"

---

## Dashboard Queries

### Dashboard 1: Stage 25 Overview (Single Venture)

**Purpose**: Show all KPIs for a single venture at a glance

**Query**:
```sql
WITH test_results AS (
    SELECT venture_id,
           test_type,
           coverage_percentage,
           tests_passed + tests_failed AS total_tests,
           tests_passed,
           tests_failed,
           duration_seconds
    FROM stage_25_test_results
    WHERE venture_id = 'VENTURE-001'
),
bug_summary AS (
    SELECT venture_id,
           COUNT(*) AS total_bugs,
           COUNT(*) FILTER (WHERE severity IN ('P0', 'P1')) AS critical_bugs,
           COUNT(*) FILTER (WHERE status = 'verified') AS bugs_resolved
    FROM stage_25_bugs
    WHERE venture_id = 'VENTURE-001'
    GROUP BY venture_id
),
quality AS (
    SELECT venture_id,
           quality_score,
           test_coverage_score,
           defect_density_score
    FROM stage_25_quality_metrics
    WHERE venture_id = 'VENTURE-001'
    ORDER BY calculated_at DESC
    LIMIT 1
)
SELECT tr.venture_id,
       -- Test Coverage
       MAX(tr.coverage_percentage) FILTER (WHERE tr.test_type = 'unit') AS unit_coverage,
       MAX(tr.coverage_percentage) FILTER (WHERE tr.test_type = 'integration') AS integration_coverage,
       MAX(tr.coverage_percentage) FILTER (WHERE tr.test_type = 'e2e') AS e2e_coverage,
       -- Test Results
       SUM(tr.total_tests) AS total_tests,
       SUM(tr.tests_passed) AS tests_passed,
       SUM(tr.tests_failed) AS tests_failed,
       ROUND((SUM(tr.tests_passed)::DECIMAL / NULLIF(SUM(tr.total_tests), 0) * 100), 2) AS pass_rate,
       -- Bug Summary
       bs.total_bugs,
       bs.critical_bugs,
       bs.bugs_resolved,
       ROUND((bs.bugs_resolved::DECIMAL / NULLIF(bs.total_bugs, 0) * 100), 2) AS resolution_rate,
       -- Quality Score
       q.quality_score,
       q.test_coverage_score,
       q.defect_density_score,
       -- Duration
       SUM(tr.duration_seconds) AS total_duration_seconds,
       ROUND(SUM(tr.duration_seconds) / 60.0, 2) AS total_duration_minutes
FROM test_results tr
LEFT JOIN bug_summary bs ON tr.venture_id = bs.venture_id
LEFT JOIN quality q ON tr.venture_id = q.venture_id
GROUP BY tr.venture_id, bs.total_bugs, bs.critical_bugs, bs.bugs_resolved, q.quality_score, q.test_coverage_score, q.defect_density_score;
```

**Expected Output** (1 row):
```
venture_id  | unit_coverage | integration_coverage | e2e_coverage | total_tests | tests_passed | tests_failed | pass_rate | total_bugs | critical_bugs | bugs_resolved | resolution_rate | quality_score | test_coverage_score | defect_density_score | total_duration_seconds | total_duration_minutes
------------|---------------|----------------------|--------------|-------------|--------------|--------------|-----------|------------|---------------|---------------|-----------------|---------------|---------------------|----------------------|------------------------|------------------------
VENTURE-001 | 85.3          | 72.1                 | 55.0         | 355         | 355          | 0            | 100.00    | 15         | 8             | 15            | 100.00          | 88.5          | 78.5                | 85.0                 | 2070                   | 34.50
```

---

### Dashboard 2: Stage 25 Cross-Venture Comparison

**Purpose**: Compare Stage 25 metrics across all ventures

**Query**:
```sql
SELECT v.id AS venture_id,
       v.title AS venture_name,
       MAX(qm.quality_score) AS quality_score,
       MAX(tr.coverage_percentage) FILTER (WHERE tr.test_type = 'unit') AS unit_coverage,
       COUNT(b.id) AS total_bugs,
       COUNT(b.id) FILTER (WHERE b.severity IN ('P0', 'P1') AND b.status != 'verified') AS open_critical_bugs,
       MAX(sg.status) AS stage_25_status,
       MAX(tr.executed_at) AS last_test_run_at
FROM ventures v
LEFT JOIN stage_25_quality_metrics qm ON v.id = qm.venture_id
LEFT JOIN stage_25_test_results tr ON v.id = tr.venture_id
LEFT JOIN stage_25_bugs b ON v.id = b.venture_id
LEFT JOIN stage_gates sg ON v.id = sg.venture_id AND sg.stage_id = 25
WHERE v.status = 'active'
GROUP BY v.id, v.title
ORDER BY MAX(qm.quality_score) DESC NULLS LAST;
```

**Expected Output** (multiple rows):
```
venture_id  | venture_name         | quality_score | unit_coverage | total_bugs | open_critical_bugs | stage_25_status | last_test_run_at
------------|----------------------|---------------|---------------|------------|--------------------|-----------------|-------------------------
VENTURE-001 | Fintech App          | 92.3          | 95.0          | 5          | 0                  | completed       | 2025-11-06 11:00:00+00
VENTURE-002 | E-commerce Platform  | 88.5          | 85.3          | 15         | 0                  | in-progress     | 2025-11-06 10:00:00+00
VENTURE-003 | Internal Tool        | 76.0          | 65.0          | 25         | 2                  | in-progress     | 2025-11-05 14:00:00+00
```

---

### Dashboard 3: Stage 25 Trends (Time Series)

**Purpose**: Show quality metrics trends over time for a single venture

**Query**:
```sql
SELECT venture_id,
       DATE(calculated_at) AS date,
       AVG(quality_score) AS avg_quality_score,
       AVG(test_coverage_score) AS avg_test_coverage_score,
       AVG(defect_density_score) AS avg_defect_density_score,
       COUNT(*) AS measurements_per_day
FROM stage_25_quality_metrics
WHERE venture_id = 'VENTURE-001'
  AND calculated_at >= NOW() - INTERVAL '30 days'
GROUP BY venture_id, DATE(calculated_at)
ORDER BY date DESC;
```

**Expected Output** (multiple rows):
```
venture_id  | date       | avg_quality_score | avg_test_coverage_score | avg_defect_density_score | measurements_per_day
------------|------------|-------------------|-------------------------|--------------------------|---------------------
VENTURE-001 | 2025-11-06 | 88.5              | 78.5                    | 85.0                     | 3
VENTURE-001 | 2025-11-05 | 87.2              | 77.0                    | 84.0                     | 2
VENTURE-001 | 2025-11-04 | 85.0              | 75.0                    | 82.0                     | 1
```

**Visualization**: Line chart with 3 lines (quality_score, test_coverage_score, defect_density_score)

---

## Real-Time Monitoring

### Table: `stage_25_execution_status`

**Purpose**: Track current substage execution status for real-time monitoring

```sql
CREATE TABLE stage_25_execution_status (
    venture_id UUID PRIMARY KEY REFERENCES ventures(id),
    current_substage TEXT CHECK (current_substage IN ('25.1', '25.2', '25.3')),
    substage_status TEXT CHECK (substage_status IN ('pending', 'in-progress', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    estimated_completion_at TIMESTAMPTZ,
    progress_percentage INTEGER CHECK (progress_percentage BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example row:
-- venture_id='VENTURE-001', current_substage='25.2', substage_status='in-progress', progress_percentage=60 (60% of bugs fixed)
```

### Real-Time Query (WebSocket or Polling)

```sql
SELECT venture_id,
       current_substage,
       substage_status,
       progress_percentage,
       EXTRACT(EPOCH FROM (estimated_completion_at - NOW())) / 60 AS minutes_remaining,
       updated_at
FROM stage_25_execution_status
WHERE venture_id = 'VENTURE-001';

-- Poll every 10 seconds, update dashboard in real-time
```

---

## Alerting Rules

### Alert 1: Test Failure (Critical)

**Trigger**: `tests_failed > 0` (any test fails)

**Notification**: Slack, email to QA engineer

**Query**:
```sql
SELECT venture_id,
       test_type,
       tests_failed,
       executed_at
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001'
  AND tests_failed > 0;
```

### Alert 2: P0 Bug Detected (Critical)

**Trigger**: Bug with severity P0 created

**Notification**: Slack, email to QA lead + PLAN agent

**Query**:
```sql
SELECT venture_id,
       bug_id,
       title,
       severity,
       reported_at
FROM stage_25_bugs
WHERE venture_id = 'VENTURE-001'
  AND severity = 'P0'
  AND status = 'open';
```

### Alert 3: Quality Score Below Threshold (Warning)

**Trigger**: Quality score <85 (fails release approval)

**Notification**: Slack, email to QA lead

**Query**:
```sql
SELECT venture_id,
       quality_score,
       calculated_at
FROM stage_25_quality_metrics
WHERE venture_id = 'VENTURE-001'
  AND quality_score < 85
ORDER BY calculated_at DESC
LIMIT 1;
```

### Alert 4: Test Execution Timeout (Warning)

**Trigger**: Test duration >1 hour (3600 seconds)

**Notification**: Slack, email to QA engineer (optimize tests)

**Query**:
```sql
SELECT venture_id,
       SUM(duration_seconds) AS total_duration_seconds,
       ROUND(SUM(duration_seconds) / 60.0, 2) AS total_duration_minutes
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001'
GROUP BY venture_id
HAVING SUM(duration_seconds) > 3600;
```

---

## Sources Table

| Claim | Repo | Commit | Path | Lines | Excerpt |
|-------|------|--------|------|-------|---------|
| Test coverage metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1117 | "- Test coverage" |
| Defect density metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1118 | "- Defect density" |
| Quality score metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1119 | "- Quality score" |
| Tests passed gate | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1125 | "- Tests passed" |
| Fixes verified | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1139 | "- Fixes verified" |
| Regression tested | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1140 | "- Regression tested" |

---

**Next**: See `10_gaps-backlog.md` for improvement areas and proposed Strategic Directives.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
