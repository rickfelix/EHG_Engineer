---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Primary Metrics (from stages.yaml)](#primary-metrics-from-stagesyaml)
  - [Metric 1: Decomposition Depth](#metric-1-decomposition-depth)
  - [Metric 2: Task Clarity](#metric-2-task-clarity)
  - [Metric 3: Dependency Resolution](#metric-3-dependency-resolution)
- [Secondary Metrics (Performance & Quality)](#secondary-metrics-performance-quality)
  - [Metric 4: WBS Versioning Rate](#metric-4-wbs-versioning-rate)
  - [Metric 5: Recursion Trigger Breakdown](#metric-5-recursion-trigger-breakdown)
  - [Metric 6: Stage 8 Execution Time](#metric-6-stage-8-execution-time)
  - [Metric 7: Exit Gate Pass Rate](#metric-7-exit-gate-pass-rate)
  - [Metric 8: Critical Path Accuracy](#metric-8-critical-path-accuracy)
  - [Metric 9: Task Granularity Distribution](#metric-9-task-granularity-distribution)
- [Recursion-Specific Metrics](#recursion-specific-metrics)
  - [Metric 10: Chairman Approval Time](#metric-10-chairman-approval-time)
  - [Metric 11: WBS Version Effort Drift](#metric-11-wbs-version-effort-drift)
- [Monitoring Dashboards](#monitoring-dashboards)
  - [Dashboard 1: Stage 8 Health Overview](#dashboard-1-stage-8-health-overview)
  - [Dashboard 2: Recursion Analytics](#dashboard-2-recursion-analytics)
  - [Dashboard 3: Automation ROI](#dashboard-3-automation-roi)
- [Alerting Rules](#alerting-rules)
  - [Critical Alerts (Immediate Action Required)](#critical-alerts-immediate-action-required)
  - [Warning Alerts (Proactive Monitoring)](#warning-alerts-proactive-monitoring)
  - [Informational Alerts (Trend Monitoring)](#informational-alerts-trend-monitoring)
- [Database Queries (Copy-Paste Ready)](#database-queries-copy-paste-ready)
  - [Query 1: Stage 8 Metrics Summary (Single Venture)](#query-1-stage-8-metrics-summary-single-venture)
  - [Query 2: Weekly Aggregate Metrics](#query-2-weekly-aggregate-metrics)
- [Gap Analysis for Metrics & Monitoring](#gap-analysis-for-metrics-monitoring)
- [Sources Table](#sources-table)

<!-- ARCHIVED: 2026-01-26T16:26:52.323Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-08\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 8 Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, unit, sd, validation

## Overview

This document defines Key Performance Indicators (KPIs), database queries, and monitoring dashboards for Stage 8 (Problem Decomposition Engine).

**Purpose**: Enable data-driven optimization of decomposition quality, performance, and recursion effectiveness
**Monitoring Frequency**: Real-time (per venture) + Weekly aggregates + Monthly trend analysis
**Alerting**: Automated alerts when metrics fall outside thresholds

---

## Primary Metrics (from stages.yaml)

### Metric 1: Decomposition Depth

**Definition**: Average number of WBS levels across all task hierarchies
**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:334 "Decomposition depth"`
**Unit**: Levels (integer)
**Target Threshold**: 3-5 levels (proposed)
**Measurement Frequency**: Per venture (after Stage 8 exit)

**Calculation**:
```sql
-- Query: Calculate WBS depth for a venture
WITH RECURSIVE wbs_hierarchy AS (
  -- Root tasks (no parent)
  SELECT
    task_id,
    parent_task_id,
    1 AS depth
  FROM venture_tasks
  WHERE venture_id = $1
    AND parent_task_id IS NULL

  UNION ALL

  -- Child tasks (recursive)
  SELECT
    vt.task_id,
    vt.parent_task_id,
    wh.depth + 1
  FROM venture_tasks vt
  INNER JOIN wbs_hierarchy wh ON vt.parent_task_id = wh.task_id
  WHERE vt.venture_id = $1
)
SELECT
  venture_id,
  MAX(depth) AS max_depth,
  AVG(depth) AS avg_depth,
  COUNT(DISTINCT task_id) AS total_tasks
FROM wbs_hierarchy
GROUP BY venture_id;
```

**Interpretation**:
- **avg_depth < 3**: Under-decomposed, may have overly broad tasks (risk: unclear execution)
- **avg_depth 3-5**: Optimal decomposition (clear task hierarchy, manageable granularity)
- **avg_depth > 5**: Over-engineered, excessive granularity (risk: overhead, complexity)

**Alert Triggers**:
- `avg_depth < 3`: Email EXEC agent (warning: shallow WBS)
- `avg_depth > 5`: Email EXEC agent (warning: over-decomposition)

**Dashboard Visualization**: Line chart showing avg_depth trend across last 20 ventures

---

### Metric 2: Task Clarity

**Definition**: Percentage of tasks with clear acceptance criteria defined
**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:335 "Task clarity"`
**Unit**: Percentage (0-100%)
**Target Threshold**: >95% (proposed)
**Measurement Frequency**: Per venture (after Stage 8 exit)

**Calculation**:
```sql
-- Query: Calculate task clarity percentage
SELECT
  venture_id,
  COUNT(*) AS total_tasks,
  COUNT(CASE WHEN acceptance_criteria IS NOT NULL AND JSONB_ARRAY_LENGTH(acceptance_criteria) >= 1 THEN 1 END) AS tasks_with_criteria,
  ROUND(
    (COUNT(CASE WHEN acceptance_criteria IS NOT NULL AND JSONB_ARRAY_LENGTH(acceptance_criteria) >= 1 THEN 1 END)::DECIMAL
     / COUNT(*)::DECIMAL) * 100,
    2
  ) AS task_clarity_pct
FROM venture_tasks
WHERE venture_id = $1
GROUP BY venture_id;
```

**Interpretation**:
- **task_clarity_pct < 80%**: Poor clarity, many tasks lack acceptance criteria (risk: execution ambiguity)
- **task_clarity_pct 80-95%**: Acceptable clarity (most tasks defined, minor gaps)
- **task_clarity_pct > 95%**: Excellent clarity (all tasks have clear criteria)

**Exit Gate Validation**: Exit gate 2 (Tasks prioritized) should enforce task_clarity_pct >= 95%

**Alert Triggers**:
- `task_clarity_pct < 95%`: Block Stage 8 exit (exit gate failure)
- `task_clarity_pct < 80%`: Critical alert to EXEC agent

**Dashboard Visualization**: Gauge chart showing current venture task clarity percentage with 95% threshold line

---

### Metric 3: Dependency Resolution

**Definition**: Percentage of task dependencies successfully mapped in dependency graph
**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:336 "Dependency resolution"`
**Unit**: Percentage (0-100%)
**Target Threshold**: 100% (proposed)
**Measurement Frequency**: Per venture (after Stage 8 exit)

**Calculation**:
```sql
-- Query: Calculate dependency resolution percentage
WITH task_dependencies AS (
  -- Count expected dependencies (tasks that should have dependencies based on sequence)
  SELECT
    venture_id,
    COUNT(*) AS total_tasks,
    COUNT(CASE WHEN task_id ~ '^\d+\.\d+' THEN 1 END) AS tasks_expecting_dependencies
  FROM venture_tasks
  WHERE venture_id = $1
),
mapped_dependencies AS (
  -- Count actual mapped dependencies
  SELECT
    venture_id,
    COUNT(*) AS mapped_count
  FROM venture_dependencies
  WHERE venture_id = $1
)
SELECT
  td.venture_id,
  td.total_tasks,
  td.tasks_expecting_dependencies,
  md.mapped_count,
  ROUND(
    (md.mapped_count::DECIMAL / NULLIF(td.tasks_expecting_dependencies, 0)::DECIMAL) * 100,
    2
  ) AS dependency_resolution_pct
FROM task_dependencies td
LEFT JOIN mapped_dependencies md ON td.venture_id = md.venture_id;
```

**Interpretation**:
- **dependency_resolution_pct < 90%**: Incomplete dependency mapping (risk: missing critical path)
- **dependency_resolution_pct 90-99%**: Mostly complete (minor gaps acceptable)
- **dependency_resolution_pct = 100%**: Fully mapped dependencies (all tasks linked)

**Exit Gate Validation**: Exit gate 3 (Dependencies mapped) should enforce dependency_resolution_pct = 100%

**Alert Triggers**:
- `dependency_resolution_pct < 100%`: Block Stage 8 exit (exit gate failure)
- `dependency_resolution_pct < 90%`: Critical alert to EXEC agent

**Dashboard Visualization**: Progress bar showing dependency resolution percentage with 100% target

---

## Secondary Metrics (Performance & Quality)

### Metric 4: WBS Versioning Rate

**Definition**: Percentage of ventures requiring WBS re-decomposition (v1 → v2+)
**Unit**: Percentage (0-100%)
**Target Threshold**: <20% (proposed - minimize recursions)
**Measurement Frequency**: Weekly aggregate

**Calculation**:
```sql
-- Query: Calculate WBS versioning rate
WITH venture_wbs_versions AS (
  SELECT
    venture_id,
    COUNT(DISTINCT wbs_version) AS version_count
  FROM venture_wbs_history
  GROUP BY venture_id
)
SELECT
  COUNT(CASE WHEN version_count > 1 THEN 1 END) AS ventures_with_recursion,
  COUNT(*) AS total_ventures,
  ROUND(
    (COUNT(CASE WHEN version_count > 1 THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100,
    2
  ) AS recursion_rate_pct
FROM venture_wbs_versions
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Interpretation**:
- **recursion_rate_pct < 10%**: Excellent initial decomposition quality (rare recursions)
- **recursion_rate_pct 10-20%**: Acceptable recursion rate (some technical issues expected)
- **recursion_rate_pct > 20%**: High recursion rate (poor initial decomposition or unclear requirements)

**Trend Analysis**: Track recursion_rate_pct over time to measure decomposition quality improvement

**Alert Triggers**:
- `recursion_rate_pct > 30%`: Email LEAD agent (systemic issue with decomposition process)

**Dashboard Visualization**: Line chart showing weekly recursion rate trend

---

### Metric 5: Recursion Trigger Breakdown

**Definition**: Distribution of recursion trigger types (TECH-001, RESOURCE-001, TIMELINE-001)
**Unit**: Count per trigger type
**Target Threshold**: N/A (informational)
**Measurement Frequency**: Monthly aggregate

**Calculation**:
```sql
-- Query: Recursion trigger breakdown
SELECT
  trigger_type,
  COUNT(*) AS trigger_count,
  ROUND(
    (COUNT(*)::DECIMAL / SUM(COUNT(*)) OVER ()) * 100,
    2
  ) AS trigger_pct
FROM recursion_events
WHERE to_stage = 8
  AND status = 'APPROVED'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY trigger_type
ORDER BY trigger_count DESC;
```

**Interpretation**:
- **TECH-001 dominance (>60%)**: Technical feasibility is primary decomposition blocker
- **RESOURCE-001 dominance**: Stage 7 resource planning is frequently incorrect
- **TIMELINE-001 dominance**: Stage 7 timeline planning is frequently underestimated

**Actionable Insights**:
- If TECH-001 high: Implement technical feasibility pre-check in Stage 8 (Gap #7)
- If RESOURCE-001 high: Improve Stage 7 resource estimation accuracy
- If TIMELINE-001 high: Improve Stage 7 timeline estimation accuracy

**Dashboard Visualization**: Pie chart showing recursion trigger type distribution

---

### Metric 6: Stage 8 Execution Time

**Definition**: Total time (hours) to complete Stage 8 (all substages)
**Unit**: Hours
**Target Threshold**: <16 hours manual, <2 hours automated (proposed)
**Measurement Frequency**: Per venture

**Calculation**:
```sql
-- Query: Stage 8 execution time
SELECT
  venture_id,
  MIN(created_at) AS stage_8_start,
  MAX(updated_at) AS stage_8_end,
  EXTRACT(EPOCH FROM (MAX(updated_at) - MIN(created_at))) / 3600 AS execution_hours
FROM venture_stage_history
WHERE stage_id = 8
  AND venture_id = $1
GROUP BY venture_id;
```

**Interpretation**:
- **execution_hours < 8**: Fast execution (likely automated or simple venture)
- **execution_hours 8-16**: Normal manual execution (3 substages, 13.5 hours target)
- **execution_hours > 16**: Slow execution (complex venture or process bottleneck)

**Automation Impact**: Track execution_hours before/after AI-assisted WBS implementation to measure automation ROI

**Alert Triggers**:
- `execution_hours > 24`: Email EXEC agent (excessive time, investigate bottleneck)

**Dashboard Visualization**: Histogram showing distribution of execution times across ventures

---

### Metric 7: Exit Gate Pass Rate

**Definition**: Percentage of ventures passing all 3 exit gates on first attempt (no rework)
**Unit**: Percentage (0-100%)
**Target Threshold**: >90% (proposed)
**Measurement Frequency**: Weekly aggregate

**Calculation**:
```sql
-- Query: Exit gate pass rate
WITH exit_gate_attempts AS (
  SELECT
    venture_id,
    COUNT(*) AS attempt_count
  FROM venture_stage_history
  WHERE stage_id = 8
    AND event_type = 'EXIT_GATE_VALIDATION'
  GROUP BY venture_id
)
SELECT
  COUNT(CASE WHEN attempt_count = 1 THEN 1 END) AS passed_first_attempt,
  COUNT(*) AS total_ventures,
  ROUND(
    (COUNT(CASE WHEN attempt_count = 1 THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100,
    2
  ) AS pass_rate_pct
FROM exit_gate_attempts
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Interpretation**:
- **pass_rate_pct > 90%**: High quality WBS creation (rare exit gate failures)
- **pass_rate_pct 70-90%**: Acceptable quality (some rework expected)
- **pass_rate_pct < 70%**: Low quality (frequent exit gate failures, process issue)

**Root Cause Analysis**: If pass_rate_pct < 70%, investigate which exit gate is failing most frequently

**Dashboard Visualization**: Gauge chart showing current weekly pass rate with 90% threshold

---

### Metric 8: Critical Path Accuracy

**Definition**: Percentage difference between Stage 8 estimated critical path duration and actual Stage 22 completion time
**Unit**: Percentage deviation
**Target Threshold**: <10% deviation (proposed)
**Measurement Frequency**: Per venture (after Stage 22 completion)

**Calculation**:
```sql
-- Query: Critical path accuracy
WITH stage_8_estimate AS (
  SELECT
    venture_id,
    critical_path->>'duration_weeks' AS estimated_weeks
  FROM venture_dependencies
  WHERE venture_id = $1
),
stage_22_actual AS (
  SELECT
    venture_id,
    EXTRACT(EPOCH FROM (MAX(updated_at) - MIN(created_at))) / (3600 * 24 * 7) AS actual_weeks
  FROM venture_stage_history
  WHERE stage_id BETWEEN 8 AND 22
    AND venture_id = $1
  GROUP BY venture_id
)
SELECT
  s8.venture_id,
  s8.estimated_weeks::DECIMAL,
  s22.actual_weeks,
  ROUND(
    ABS((s22.actual_weeks - s8.estimated_weeks::DECIMAL) / s8.estimated_weeks::DECIMAL) * 100,
    2
  ) AS deviation_pct
FROM stage_8_estimate s8
INNER JOIN stage_22_actual s22 ON s8.venture_id = s22.venture_id;
```

**Interpretation**:
- **deviation_pct < 10%**: Accurate critical path estimation (excellent decomposition)
- **deviation_pct 10-25%**: Acceptable estimation (typical variance)
- **deviation_pct > 25%**: Poor estimation (decomposition assumptions incorrect)

**Feedback Loop**: Use deviation_pct to improve future Stage 8 effort estimation

**Dashboard Visualization**: Scatter plot showing estimated vs actual weeks with 10% deviation bands

---

### Metric 9: Task Granularity Distribution

**Definition**: Distribution of task effort estimates (histogram of task sizes)
**Unit**: Count per effort bucket
**Target Threshold**: Majority tasks in 8-40 hour range (proposed)
**Measurement Frequency**: Per venture

**Calculation**:
```sql
-- Query: Task granularity distribution
SELECT
  venture_id,
  CASE
    WHEN effort_estimate_hours < 8 THEN '0-8h (Too Small)'
    WHEN effort_estimate_hours BETWEEN 8 AND 40 THEN '8-40h (Optimal)'
    WHEN effort_estimate_hours BETWEEN 41 AND 80 THEN '41-80h (Large)'
    ELSE '>80h (Too Large)'
  END AS effort_bucket,
  COUNT(*) AS task_count
FROM venture_tasks
WHERE venture_id = $1
GROUP BY venture_id, effort_bucket
ORDER BY MIN(effort_estimate_hours);
```

**Interpretation**:
- **Majority in '0-8h'**: Over-decomposed (too granular, high overhead)
- **Majority in '8-40h'**: Optimal granularity (atomic tasks, manageable size)
- **Majority in '>80h'**: Under-decomposed (tasks too large, should break down)

**Exit Gate Enhancement**: Consider adding granularity validation (flag tasks >80h)

**Dashboard Visualization**: Horizontal bar chart showing task count per effort bucket

---

## Recursion-Specific Metrics

### Metric 10: Chairman Approval Time

**Definition**: Time (hours) from TECH-001 trigger to Chairman approval/rejection
**Unit**: Hours
**Target Threshold**: <24 hours (proposed)
**Measurement Frequency**: Per recursion event

**Calculation**:
```sql
-- Query: Chairman approval time
SELECT
  venture_id,
  trigger_type,
  EXTRACT(EPOCH FROM (approved_at - created_at)) / 3600 AS approval_hours
FROM recursion_events
WHERE to_stage = 8
  AND status IN ('APPROVED', 'REJECTED')
  AND approved_at IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

**Interpretation**:
- **approval_hours < 8**: Fast turnaround (Chairman responsive)
- **approval_hours 8-24**: Acceptable turnaround (same-day approval)
- **approval_hours > 24**: Slow turnaround (bottleneck, blocks Stage 8 progress)

**Alert Triggers**:
- `approval_hours > 48`: Email Chairman (reminder: pending recursion approval)

**Dashboard Visualization**: Line chart showing approval time trend over last 20 recursions

---

### Metric 11: WBS Version Effort Drift

**Definition**: Percentage change in total effort estimate between WBS v1 and v2
**Unit**: Percentage change
**Target Threshold**: N/A (informational, expect increase after TECH-001)
**Measurement Frequency**: Per recursion event

**Calculation**:
```sql
-- Query: WBS version effort drift
WITH wbs_versions AS (
  SELECT
    venture_id,
    wbs_version,
    SUM((wbs_data->'tasks'->0->>'effort_estimate_hours')::DECIMAL) AS total_effort_hours
  FROM venture_wbs_history
  WHERE venture_id = $1
  GROUP BY venture_id, wbs_version
)
SELECT
  v1.venture_id,
  v1.total_effort_hours AS v1_effort,
  v2.total_effort_hours AS v2_effort,
  ROUND(
    ((v2.total_effort_hours - v1.total_effort_hours) / v1.total_effort_hours) * 100,
    2
  ) AS effort_drift_pct
FROM wbs_versions v1
INNER JOIN wbs_versions v2 ON v1.venture_id = v2.venture_id AND v1.wbs_version = 'v1' AND v2.wbs_version = 'v2';
```

**Interpretation**:
- **effort_drift_pct < 10%**: Minor effort increase (technical constraints added small overhead)
- **effort_drift_pct 10-25%**: Moderate effort increase (expected for TECH-001 recursion)
- **effort_drift_pct > 25%**: Major effort increase (technical issues significantly underestimated)

**Feedback to Stage 7**: If effort_drift_pct consistently >25%, Stage 7 technical requirements are incomplete

**Dashboard Visualization**: Bar chart comparing v1 vs v2 effort estimates with drift percentage

---

## Monitoring Dashboards

### Dashboard 1: Stage 8 Health Overview

**Purpose**: Real-time health check of Stage 8 execution quality
**Refresh Frequency**: Every 5 minutes
**Audience**: EXEC agent, Operations team

**Widgets**:
1. **Exit Gate Pass Rate** (Gauge): Current weekly pass rate vs 90% target
2. **Task Clarity** (Gauge): Current venture task clarity vs 95% target
3. **Dependency Resolution** (Gauge): Current venture dependency resolution vs 100% target
4. **WBS Depth** (Indicator): Current venture avg_depth with 3-5 range indicator
5. **Execution Time** (Line Chart): Last 10 ventures execution time trend
6. **Recursion Rate** (Line Chart): Weekly recursion rate trend (last 12 weeks)

**Alert Panel**: Active alerts (exit gate failures, slow approvals, high recursion rate)

---

### Dashboard 2: Recursion Analytics

**Purpose**: Analyze recursion patterns and optimize prevention strategies
**Refresh Frequency**: Daily
**Audience**: LEAD agent, Chairman, Process Improvement team

**Widgets**:
1. **Recursion Trigger Breakdown** (Pie Chart): TECH-001 vs RESOURCE-001 vs TIMELINE-001 distribution
2. **Chairman Approval Time** (Line Chart): Approval time trend over last 30 recursions
3. **WBS Version Effort Drift** (Bar Chart): v1 vs v2 effort comparison for last 10 recursions
4. **Recursion Loop Prevention** (Table): Ventures approaching max 3 recursions (risk list)
5. **Recursion Rate by Venture Complexity** (Scatter Plot): Correlation between complexity score and recursion likelihood

**Insight Panel**: AI-suggested insights (e.g., "TECH-001 triggers increased 15% this month - recommend implementing technical feasibility pre-check")

---

### Dashboard 3: Automation ROI

**Purpose**: Measure impact of AI-assisted WBS automation
**Refresh Frequency**: Weekly
**Audience**: Chairman, Engineering Leadership

**Widgets**:
1. **Execution Time Comparison** (Bar Chart): Manual vs AI-assisted execution time
2. **Automation Adoption Rate** (Line Chart): % of ventures using AI-assisted WBS over time
3. **Quality Impact** (Table): Exit gate pass rate, task clarity, dependency resolution (manual vs AI-assisted)
4. **Cost Savings** (Indicator): Total hours saved via automation × EXEC agent hourly rate

**ROI Calculation**:
```
ROI = (Total Hours Saved × Agent Hourly Rate - AI Infrastructure Cost) / AI Infrastructure Cost × 100
```

---

## Alerting Rules

### Critical Alerts (Immediate Action Required)

| Alert | Trigger Condition | Recipient | Action |
|-------|------------------|-----------|--------|
| **Exit Gate Failure** | `task_clarity_pct < 95%` OR `dependency_resolution_pct < 100%` | EXEC agent | Block Stage 9 entry, fix WBS |
| **Recursion Loop Risk** | Venture has 3 recursions to Stage 8 | Chairman | Decide: simplify/kill/hire/pivot |
| **Slow Chairman Approval** | `approval_hours > 48` | Chairman | Approve/reject pending recursion |

### Warning Alerts (Proactive Monitoring)

| Alert | Trigger Condition | Recipient | Action |
|-------|------------------|-----------|--------|
| **High Recursion Rate** | `recursion_rate_pct > 30%` (weekly) | LEAD agent | Investigate decomposition process |
| **Shallow WBS** | `avg_depth < 3` | EXEC agent | Review WBS, add detail |
| **Over-Decomposed WBS** | `avg_depth > 5` | EXEC agent | Review WBS, consolidate tasks |
| **Slow Execution** | `execution_hours > 24` | EXEC agent | Investigate bottleneck |

### Informational Alerts (Trend Monitoring)

| Alert | Trigger Condition | Recipient | Action |
|-------|------------------|-----------|--------|
| **Automation Milestone** | 50% of ventures using AI-assisted WBS | Engineering team | Celebrate, analyze learnings |
| **Critical Path Accuracy Improving** | `avg(deviation_pct) < 10%` (monthly) | EXEC agent | Document best practices |

---

## Database Queries (Copy-Paste Ready)

### Query 1: Stage 8 Metrics Summary (Single Venture)

```sql
-- Input: $venture_id
SELECT
  v.id AS venture_id,
  v.name AS venture_name,

  -- Decomposition Depth
  (SELECT MAX(depth) FROM (
    WITH RECURSIVE wbs_hierarchy AS (
      SELECT task_id, parent_task_id, 1 AS depth
      FROM venture_tasks
      WHERE venture_id = v.id AND parent_task_id IS NULL
      UNION ALL
      SELECT vt.task_id, vt.parent_task_id, wh.depth + 1
      FROM venture_tasks vt
      INNER JOIN wbs_hierarchy wh ON vt.parent_task_id = wh.task_id
      WHERE vt.venture_id = v.id
    )
    SELECT depth FROM wbs_hierarchy
  ) AS depths) AS max_wbs_depth,

  -- Task Clarity
  ROUND(
    (COUNT(CASE WHEN vt.acceptance_criteria IS NOT NULL AND JSONB_ARRAY_LENGTH(vt.acceptance_criteria) >= 1 THEN 1 END)::DECIMAL
     / COUNT(vt.id)::DECIMAL) * 100,
    2
  ) AS task_clarity_pct,

  -- Dependency Resolution
  (SELECT COUNT(*) FROM venture_dependencies WHERE venture_id = v.id) AS mapped_dependencies_count,

  -- Execution Time
  (SELECT EXTRACT(EPOCH FROM (MAX(updated_at) - MIN(created_at))) / 3600
   FROM venture_stage_history
   WHERE stage_id = 8 AND venture_id = v.id) AS execution_hours,

  -- Recursion Count
  (SELECT COUNT(*) FROM recursion_events WHERE venture_id = v.id AND to_stage = 8 AND status = 'APPROVED') AS recursion_count

FROM ventures v
LEFT JOIN venture_tasks vt ON v.id = vt.venture_id
WHERE v.id = $venture_id
GROUP BY v.id, v.name;
```

---

### Query 2: Weekly Aggregate Metrics

```sql
-- Weekly metrics rollup
SELECT
  DATE_TRUNC('week', created_at) AS week_start,

  -- Exit Gate Pass Rate
  ROUND(
    (COUNT(CASE WHEN exit_gate_attempts = 1 THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100,
    2
  ) AS exit_gate_pass_rate_pct,

  -- Average Execution Time
  ROUND(AVG(execution_hours), 2) AS avg_execution_hours,

  -- Recursion Rate
  ROUND(
    (COUNT(CASE WHEN recursion_count > 0 THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100,
    2
  ) AS recursion_rate_pct,

  -- Ventures Completed
  COUNT(*) AS ventures_completed

FROM (
  SELECT
    v.id,
    v.created_at,
    (SELECT COUNT(*) FROM venture_stage_history WHERE stage_id = 8 AND event_type = 'EXIT_GATE_VALIDATION' AND venture_id = v.id) AS exit_gate_attempts,
    (SELECT EXTRACT(EPOCH FROM (MAX(updated_at) - MIN(created_at))) / 3600 FROM venture_stage_history WHERE stage_id = 8 AND venture_id = v.id) AS execution_hours,
    (SELECT COUNT(*) FROM recursion_events WHERE venture_id = v.id AND to_stage = 8 AND status = 'APPROVED') AS recursion_count
  FROM ventures v
  WHERE v.created_at >= NOW() - INTERVAL '12 weeks'
) AS venture_metrics
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week_start DESC;
```

---

## Gap Analysis for Metrics & Monitoring

**Identified Gaps** (feeds SD-METRICS-FRAMEWORK-001):

1. **No database tables for metrics storage** - Need `venture_stage_metrics` table
2. **No automated metric calculation** - Queries defined here, but not scheduled
3. **No monitoring dashboard implementation** - Dashboard specs defined, UI not built
4. **No alerting infrastructure** - Alert rules defined, delivery system not implemented
5. **No historical trend tracking** - Need time-series storage for weekly/monthly aggregates
6. **No AI-driven insights** - Insight panel proposed, ML model not built
7. **No ROI calculation automation** - Manual calculation required, should automate

**Recommended Priority**: Implement gaps #1, #2, #3 (metrics storage, calculation, dashboards)

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| Metric: Decomposition depth | stages.yaml:334 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:334 "Decomposition depth"` |
| Metric: Task clarity | stages.yaml:335 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:335 "Task clarity"` |
| Metric: Dependency resolution | stages.yaml:336 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:336 "Dependency resolution"` |
| Performance: <2s decomposition | critique:129 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:129 "Decomposition analysis: <2 seconds"` |
| Performance: <1s comparison | critique:131 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:131 "WBS comparison: <1 second"` |
| Target: 80% automation | critique:161 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:161 "Target State: 80% automation"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
