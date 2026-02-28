---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 27: Metrics & Monitoring


## Table of Contents

- [Current State Assessment](#current-state-assessment)
- [KPI Definitions](#kpi-definitions)
  - [KPI 1: Transaction Success Rate](#kpi-1-transaction-success-rate)
  - [KPI 2: Latency Metrics](#kpi-2-latency-metrics)
  - [KPI 3: Consistency Score](#kpi-3-consistency-score)
- [Supabase Queries](#supabase-queries)
  - [Query 1: Transaction Success Rate (Last 24 Hours)](#query-1-transaction-success-rate-last-24-hours)
  - [Query 2: Actor Message Processing Latency (Last 1 Hour)](#query-2-actor-message-processing-latency-last-1-hour)
  - [Query 3: Saga Step Execution Latency (Last 1 Hour)](#query-3-saga-step-execution-latency-last-1-hour)
  - [Query 4: Consistency Score (Last 24 Hours)](#query-4-consistency-score-last-24-hours)
  - [Query 5: Recursion Trigger Detection (SAGA-001)](#query-5-recursion-trigger-detection-saga-001)
- [Dashboard Specifications](#dashboard-specifications)
  - [Grafana Dashboard Layout (Proposed)](#grafana-dashboard-layout-proposed)
- [Alerting Rules (Prometheus/Grafana)](#alerting-rules-prometheusgrafana)
  - [Alert 1: Low Transaction Success Rate (SAGA-001 Trigger)](#alert-1-low-transaction-success-rate-saga-001-trigger)
  - [Alert 2: High Actor Message Latency](#alert-2-high-actor-message-latency)
  - [Alert 3: Low Consistency Score](#alert-3-low-consistency-score)
- [Monitoring Implementation Checklist](#monitoring-implementation-checklist)
- [Sources Table](#sources-table)

**Stage**: Actor Model & Saga Transaction Integration
**Metrics Defined**: 3 (from stages.yaml)
**Current State**: Metrics listed but thresholds missing
**Proposed State**: Full KPI framework with Supabase queries and dashboards

---

## Current State Assessment

**Metrics from stages.yaml**:
1. Transaction success rate
2. Latency metrics
3. Consistency score

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1208-1211 "metrics: - Transaction success rate - Latency metrics - Consistency score"`

**Gap from Critique**:
- "Missing: Threshold values, measurement frequency"
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:38 "Missing: Threshold values, measurement frequency"`

**Testability Score**: 3/5 (Moderate) - "Metrics defined but validation criteria unclear"
- Evidence: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:9 "Testability: 3, Metrics defined but validation criteria unclear"`

---

## KPI Definitions

### KPI 1: Transaction Success Rate

**Definition**: Percentage of sagas that complete successfully without compensation.

**Formula**:
```
transaction_success_rate = (successful_sagas / total_sagas) * 100
```

**Data Source**: Saga execution events in event store

**Measurement Frequency**: Real-time (per saga execution), aggregated over 5-minute windows

**Thresholds** (proposed):
- **Target**: ≥99.5% (production), ≥90% (development)
- **Warning**: 95-99.5% (investigate if sustained >15 minutes)
- **Critical**: <95% (trigger SAGA-001 recursion)

**Evidence**: Metric from stages.yaml (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1209`)

---

### KPI 2: Latency Metrics

**Sub-metrics**:

#### 2a. Actor Message Processing Latency

**Definition**: Time from message arrival to actor mailbox until message processing completes.

**Formula**:
```
actor_latency = message_complete_timestamp - message_arrival_timestamp
```

**Percentiles Tracked**: p50, p95, p99, p100 (max)

**Thresholds** (proposed):
- **p95**: ≤50ms (target), 50-100ms (warning), >100ms (critical)
- **p99**: ≤100ms (target), 100-200ms (warning), >200ms (critical)

#### 2b. Saga Step Execution Latency

**Definition**: Time from saga step start to step completion (success or failure).

**Formula**:
```
saga_step_latency = step_complete_timestamp - step_start_timestamp
```

**Percentiles Tracked**: p50, p95, p99, p100 (max)

**Thresholds** (proposed):
- **p95**: ≤200ms (target), 200-500ms (warning), >500ms (critical)
- **p99**: ≤500ms (target), 500-1000ms (warning), >1000ms (critical)

#### 2c. End-to-End Saga Latency

**Definition**: Time from saga initiation to saga completion (success or compensation).

**Formula**:
```
saga_total_latency = saga_complete_timestamp - saga_start_timestamp
```

**Percentiles Tracked**: p50, p95, p99, p100 (max)

**Thresholds** (proposed):
- **p95**: ≤2000ms (target), 2000-5000ms (warning), >5000ms (critical)
- **p99**: ≤5000ms (target), 5000-10000ms (warning), >10000ms (critical)

**Evidence**: Metric from stages.yaml (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1210`)

---

### KPI 3: Consistency Score

**Definition**: Percentage of consistency validation queries that pass (i.e., no orphaned transactions or state mismatches detected).

**Formula**:
```
consistency_score = (passed_validations / total_validations) * 100
```

**Validation Queries** (examples):
1. **No orphaned sagas**: Sagas in "started" state for >1 hour
2. **Actor state matches events**: Actor snapshot matches event replay result
3. **No duplicate events**: Event IDs are unique in event store
4. **No compensation gaps**: Every failed saga has compensation events

**Measurement Frequency**: Hourly batch validation

**Thresholds** (proposed):
- **Target**: ≥99.9% (production), ≥95% (development)
- **Warning**: 99-99.9% (investigate if sustained >1 hour)
- **Critical**: <99% (trigger SAGA-001 or SAGA-002 recursion)

**Evidence**: Metric from stages.yaml (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1211`) and exit gate "Consistency verified" (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1219`)

---

## Supabase Queries

### Query 1: Transaction Success Rate (Last 24 Hours)

```sql
-- Assumes saga_executions table with columns: id, saga_name, status, started_at, completed_at
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') AS successful_sagas,
  COUNT(*) AS total_sagas,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100,
    2
  ) AS transaction_success_rate_pct
FROM saga_executions
WHERE started_at >= NOW() - INTERVAL '24 hours';
```

**Expected Output**:
```
successful_sagas | total_sagas | transaction_success_rate_pct
-----------------|-------------|-----------------------------
      4750       |    4800     |           98.96
```

---

### Query 2: Actor Message Processing Latency (Last 1 Hour)

```sql
-- Assumes actor_message_log table with columns: id, actor_id, message_type, arrived_at, completed_at
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms,
  MAX(latency_ms) AS max_ms
FROM (
  SELECT EXTRACT(EPOCH FROM (completed_at - arrived_at)) * 1000 AS latency_ms
  FROM actor_message_log
  WHERE arrived_at >= NOW() - INTERVAL '1 hour'
    AND completed_at IS NOT NULL
) AS latencies;
```

**Expected Output**:
```
p50_ms | p95_ms | p99_ms | max_ms
-------|--------|--------|-------
  25   |   45   |   85   |  320
```

---

### Query 3: Saga Step Execution Latency (Last 1 Hour)

```sql
-- Assumes saga_step_log table with columns: id, saga_id, step_name, started_at, completed_at
SELECT
  step_name,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms
FROM (
  SELECT
    step_name,
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 AS latency_ms
  FROM saga_step_log
  WHERE started_at >= NOW() - INTERVAL '1 hour'
    AND completed_at IS NOT NULL
) AS step_latencies
GROUP BY step_name
ORDER BY p99_ms DESC;
```

**Expected Output**:
```
step_name         | p50_ms | p95_ms | p99_ms
------------------|--------|--------|-------
payment-service   |  150   |  280   |  450
inventory-check   |   80   |  120   |  180
send-confirmation |   40   |   75   |  110
```

---

### Query 4: Consistency Score (Last 24 Hours)

```sql
-- Assumes consistency_validations table with columns: id, validation_type, result, checked_at
SELECT
  validation_type,
  COUNT(*) FILTER (WHERE result = 'pass') AS passed,
  COUNT(*) AS total,
  ROUND(
    (COUNT(*) FILTER (WHERE result = 'pass')::NUMERIC / COUNT(*)::NUMERIC) * 100,
    2
  ) AS consistency_score_pct
FROM consistency_validations
WHERE checked_at >= NOW() - INTERVAL '24 hours'
GROUP BY validation_type
ORDER BY consistency_score_pct ASC;
```

**Expected Output**:
```
validation_type       | passed | total | consistency_score_pct
----------------------|--------|-------|----------------------
no_orphaned_sagas     |   23   |   24  |        95.83
actor_state_matches   |   24   |   24  |       100.00
no_duplicate_events   |   24   |   24  |       100.00
no_compensation_gaps  |   24   |   24  |       100.00
```

---

### Query 5: Recursion Trigger Detection (SAGA-001)

```sql
-- Detect transaction success rate drop below 95% in last 5 minutes
WITH recent_sagas AS (
  SELECT status
  FROM saga_executions
  WHERE started_at >= NOW() - INTERVAL '5 minutes'
)
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') AS successful,
  COUNT(*) AS total,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100,
    2
  ) AS success_rate_pct,
  CASE
    WHEN (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) < 0.95
    THEN 'TRIGGER_SAGA001'
    ELSE 'OK'
  END AS recursion_status
FROM recent_sagas;
```

**Expected Output** (if success rate drops):
```
successful | total | success_rate_pct | recursion_status
-----------|-------|------------------|------------------
    45     |   50  |      90.00       | TRIGGER_SAGA001
```

---

## Dashboard Specifications

### Grafana Dashboard Layout (Proposed)

**Dashboard Name**: "Stage 27: Actor & Saga Monitoring"

**Panels**:

#### Row 1: Transaction Success & Health
1. **Transaction Success Rate** (Gauge)
   - Query: Query 1 (Supabase)
   - Thresholds: Green (≥99.5%), Yellow (95-99.5%), Red (<95%)
   - Refresh: 1 minute

2. **Total Sagas Executed** (Stat)
   - Query: `SELECT COUNT(*) FROM saga_executions WHERE started_at >= NOW() - INTERVAL '24 hours'`
   - Refresh: 1 minute

3. **Failed Sagas** (Stat)
   - Query: `SELECT COUNT(*) FROM saga_executions WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '24 hours'`
   - Threshold: Red if >10
   - Refresh: 1 minute

#### Row 2: Latency Metrics
4. **Actor Message Latency** (Time Series)
   - Query: Query 2 (Supabase)
   - Series: p50, p95, p99
   - Y-axis: Milliseconds
   - Thresholds: p95 ≤50ms (green), 50-100ms (yellow), >100ms (red)
   - Refresh: 30 seconds

5. **Saga Step Latency** (Time Series)
   - Query: Query 3 (Supabase)
   - Series: p50, p95, p99
   - Y-axis: Milliseconds
   - Thresholds: p95 ≤200ms (green), 200-500ms (yellow), >500ms (red)
   - Refresh: 30 seconds

#### Row 3: Consistency & Validation
6. **Consistency Score** (Gauge)
   - Query: Query 4 (Supabase), overall score
   - Thresholds: Green (≥99.9%), Yellow (99-99.9%), Red (<99%)
   - Refresh: 5 minutes

7. **Consistency Validation Breakdown** (Bar Chart)
   - Query: Query 4 (Supabase)
   - X-axis: Validation type
   - Y-axis: Consistency score %
   - Refresh: 5 minutes

#### Row 4: Recursion Triggers
8. **Recursion Trigger Status** (Table)
   - Query: Query 5 (Supabase) + similar queries for SAGA-002, SAGA-003, SAGA-004
   - Columns: Trigger ID, Condition, Status
   - Alert: Red if any trigger shows "TRIGGER_*"
   - Refresh: 1 minute

9. **Recursion Events (Last 24h)** (Stat)
   - Query: `SELECT COUNT(*) FROM recursion_events WHERE triggered_at >= NOW() - INTERVAL '24 hours'`
   - Threshold: Yellow if >5, Red if >10
   - Refresh: 1 minute

---

## Alerting Rules (Prometheus/Grafana)

### Alert 1: Low Transaction Success Rate (SAGA-001 Trigger)

```yaml
- alert: LowTransactionSuccessRate
  expr: |
    (
      sum(rate(saga_executions_total{status="completed"}[5m]))
      /
      sum(rate(saga_executions_total[5m]))
    ) < 0.95
  for: 5m
  labels:
    severity: critical
    stage: 27
    recursion_trigger: SAGA-001
  annotations:
    summary: "Transaction success rate below 95% for 5 minutes"
    description: "Current rate: {{ $value | humanizePercentage }}"
```

---

### Alert 2: High Actor Message Latency

```yaml
- alert: HighActorMessageLatency
  expr: histogram_quantile(0.95, rate(actor_message_duration_seconds_bucket[5m])) > 0.1
  for: 10m
  labels:
    severity: warning
    stage: 27
  annotations:
    summary: "Actor message p95 latency above 100ms for 10 minutes"
    description: "Current p95: {{ $value | humanizeDuration }}"
```

---

### Alert 3: Low Consistency Score

```yaml
- alert: LowConsistencyScore
  expr: consistency_validations_pass_rate < 0.99
  for: 1h
  labels:
    severity: critical
    stage: 27
    recursion_trigger: SAGA-001
  annotations:
    summary: "Consistency score below 99% for 1 hour"
    description: "Current score: {{ $value | humanizePercentage }}"
```

---

## Monitoring Implementation Checklist

- [ ] **Database Tables Created**:
  - [ ] `saga_executions` (tracks saga lifecycle)
  - [ ] `saga_step_log` (tracks individual saga steps)
  - [ ] `actor_message_log` (tracks actor message processing)
  - [ ] `consistency_validations` (tracks validation results)
  - [ ] `recursion_events` (tracks recursion trigger activations)

- [ ] **Prometheus Metrics Exported**:
  - [ ] `saga_executions_total{status}` (counter)
  - [ ] `saga_duration_seconds` (histogram)
  - [ ] `actor_message_duration_seconds` (histogram)
  - [ ] `consistency_validations_total{result}` (counter)
  - [ ] `recursion_triggers_total{trigger_id}` (counter)

- [ ] **Grafana Dashboard Created**:
  - [ ] Dashboard JSON exported and version-controlled
  - [ ] All 9 panels configured with queries
  - [ ] Thresholds and color coding applied

- [ ] **Alerting Rules Deployed**:
  - [ ] 3 critical alerts configured
  - [ ] Alert notification channels set up (email, Slack, PagerDuty)
  - [ ] Runbook links added to alert annotations

- [ ] **Validation**:
  - [ ] Metrics appear in Prometheus targets
  - [ ] Dashboard loads without errors
  - [ ] Test alerts fire under simulated failure conditions

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Metrics list | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1208-1211 | "metrics: - Transaction success rate - Latency metrics - Consistency score" |
| Missing thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 38 | "Missing: Threshold values, measurement frequency" |
| Testability score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 9 | "Testability: 3, Metrics defined but validation criteria unclear" |
| Consistency exit gate | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1219 | "exit: - Consistency verified" |
| Recursion triggers | (This dossier) | N/A | 07_recursion-blueprint.md | N/A | "SAGA-001: Transaction Failure Detected" |
| Configuration thresholds | (This dossier) | N/A | 08_configurability-matrix.md | N/A | "METRIC_TRANSACTION_SUCCESS_THRESHOLD" |

---

**Next**: See `10_gaps-backlog.md` for identified gaps and proposed strategic directives.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
