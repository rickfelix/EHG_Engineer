---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 30: Metrics & Monitoring


## Table of Contents

- [Key Performance Indicators (KPIs)](#key-performance-indicators-kpis)
- [Metric 1: Deployment Success Rate](#metric-1-deployment-success-rate)
  - [Data Collection](#data-collection)
  - [Supabase Query](#supabase-query)
  - [Alert Thresholds](#alert-thresholds)
- [Metric 2: Downtime](#metric-2-downtime)
  - [Data Collection](#data-collection)
  - [Supabase Query](#supabase-query)
  - [Alert Thresholds](#alert-thresholds)
- [Metric 3: Rollback Time](#metric-3-rollback-time)
  - [Data Collection](#data-collection)
  - [Supabase Query](#supabase-query)
  - [Alert Thresholds](#alert-thresholds)
- [Deployment Dashboard (Proposed)](#deployment-dashboard-proposed)
  - [Panel 1: Deployment Success Rate (30-day rolling)](#panel-1-deployment-success-rate-30-day-rolling)
  - [Panel 2: Downtime Incidents (30-day rolling)](#panel-2-downtime-incidents-30-day-rolling)
  - [Panel 3: Rollback Performance (30-day rolling)](#panel-3-rollback-performance-30-day-rolling)
  - [Panel 4: Real-Time Deployment Status](#panel-4-real-time-deployment-status)
- [Secondary Metrics (Operational)](#secondary-metrics-operational)
  - [Metric 4: Error Rate During Deployment](#metric-4-error-rate-during-deployment)
  - [Metric 5: Response Time (p95)](#metric-5-response-time-p95)
  - [Metric 6: Database Connection Pool Utilization](#metric-6-database-connection-pool-utilization)
- [Alerting Configuration](#alerting-configuration)
  - [Alert 1: Deployment Failure](#alert-1-deployment-failure)
  - [Alert 2: Downtime Detected](#alert-2-downtime-detected)
  - [Alert 3: Rollback Time SLA Breach](#alert-3-rollback-time-sla-breach)
- [Monitoring Stack (Proposed)](#monitoring-stack-proposed)
- [Metrics Integration with SD-METRICS-FRAMEWORK-001](#metrics-integration-with-sd-metrics-framework-001)
- [Supabase Function: Calculate Deployment Success Rate](#supabase-function-calculate-deployment-success-rate)
- [Sources Table](#sources-table)

## Key Performance Indicators (KPIs)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1346-1349 "metrics"

---

## Metric 1: Deployment Success Rate

**Definition**: Percentage of deployments completed without rollback

**Formula**: `(successful_deployments / total_deployments) × 100`

**Target**: ≥99% (1 failure per 100 deployments)

**Current Baseline**: N/A (no production deployments yet)

**Measurement Frequency**: Per deployment

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1347 "Deployment success rate"

### Data Collection

**Database Table**: `deployment_logs` (proposed)

**Schema**:
```sql
CREATE TABLE deployment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id),
  deployment_version TEXT NOT NULL,
  deployment_status TEXT NOT NULL CHECK (deployment_status IN ('success', 'rollback', 'failed')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  rollback_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Supabase Query

```sql
-- Deployment success rate (last 30 days)
SELECT
  COUNT(*) FILTER (WHERE deployment_status = 'success') AS successful_deployments,
  COUNT(*) AS total_deployments,
  ROUND(
    (COUNT(*) FILTER (WHERE deployment_status = 'success')::DECIMAL / COUNT(*)) * 100,
    2
  ) AS success_rate_percent
FROM deployment_logs
WHERE started_at >= NOW() - INTERVAL '30 days';
```

### Alert Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| 🟢 Green | ≥99% | Normal operation |
| 🟡 Yellow | 95-98% | Monitor closely |
| 🔴 Red | <95% | Investigate deployment process |

---

## Metric 2: Downtime

**Definition**: Minutes of service unavailability during deployment

**Formula**: `time_service_unavailable` (measured in minutes)

**Target**: 0 minutes (zero-downtime requirement)

**Current Baseline**: N/A (no production deployments yet)

**Measurement Frequency**: Per deployment

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1348 "Downtime"

**Critical Importance**: Zero-downtime is NON-NEGOTIABLE (triggers DEPLOY-003 recursion)

### Data Collection

**Database Table**: `deployment_logs` (extended schema)

**Schema Addition**:
```sql
ALTER TABLE deployment_logs
ADD COLUMN downtime_minutes DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN downtime_detected_at TIMESTAMPTZ;
```

### Supabase Query

```sql
-- Downtime tracking (last 30 days)
SELECT
  id,
  deployment_version,
  started_at,
  completed_at,
  downtime_minutes,
  downtime_detected_at
FROM deployment_logs
WHERE started_at >= NOW() - INTERVAL '30 days'
  AND downtime_minutes > 0
ORDER BY downtime_minutes DESC;
```

### Alert Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| 🟢 Green | 0 minutes | Normal operation |
| 🔴 Red | >0 minutes | **IMMEDIATE ROLLBACK + P0 INCIDENT** |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/07_recursion-blueprint.md:DEPLOY-003 "Zero-Downtime Violated"

---

## Metric 3: Rollback Time

**Definition**: Minutes from rollback trigger to traffic restored to blue environment

**Formula**: `time_traffic_restored - time_rollback_triggered` (measured in minutes)

**Target**: <5 minutes (automated rollback speed)

**Current Baseline**: N/A (no automated rollback yet)

**Measurement Frequency**: Per rollback

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1349 "Rollback time"

### Data Collection

**Database Table**: `rollback_logs` (proposed)

**Schema**:
```sql
CREATE TABLE rollback_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployment_logs(id),
  rollback_trigger TEXT NOT NULL, -- DEPLOY-001, DEPLOY-002, DEPLOY-003
  rollback_type TEXT NOT NULL CHECK (rollback_type IN ('traffic', 'database', 'full')),
  triggered_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  rollback_duration_minutes DECIMAL(10, 2),
  rollback_success BOOLEAN,
  rollback_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Supabase Query

```sql
-- Rollback time performance (last 30 days)
SELECT
  rollback_trigger,
  rollback_type,
  AVG(rollback_duration_minutes) AS avg_rollback_time,
  MAX(rollback_duration_minutes) AS max_rollback_time,
  COUNT(*) AS rollback_count,
  COUNT(*) FILTER (WHERE rollback_success = true) AS successful_rollbacks,
  ROUND(
    (COUNT(*) FILTER (WHERE rollback_success = true)::DECIMAL / COUNT(*)) * 100,
    2
  ) AS rollback_success_rate
FROM rollback_logs
WHERE triggered_at >= NOW() - INTERVAL '30 days'
GROUP BY rollback_trigger, rollback_type
ORDER BY avg_rollback_time DESC;
```

### Alert Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| 🟢 Green | <5 minutes | Normal operation |
| 🟡 Yellow | 5-10 minutes | Optimize rollback automation |
| 🔴 Red | >10 minutes | **EMERGENCY: Manual intervention required** |

---

## Deployment Dashboard (Proposed)

**Dashboard Name**: Production Deployment Monitoring
**Tool**: Supabase Dashboard + Grafana (or similar)
**Refresh Interval**: Real-time (10-second updates)

### Panel 1: Deployment Success Rate (30-day rolling)
**Visualization**: Line chart
**Query**: Deployment success rate query (see Metric 1)

### Panel 2: Downtime Incidents (30-day rolling)
**Visualization**: Time series with annotations
**Query**: Downtime tracking query (see Metric 2)

### Panel 3: Rollback Performance (30-day rolling)
**Visualization**: Bar chart (avg rollback time by trigger type)
**Query**: Rollback time performance query (see Metric 3)

### Panel 4: Real-Time Deployment Status
**Visualization**: Status indicator (green/yellow/red)
**Query**:
```sql
-- Current deployment status (last 24 hours)
SELECT
  deployment_version,
  deployment_status,
  started_at,
  completed_at,
  downtime_minutes
FROM deployment_logs
WHERE started_at >= NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC
LIMIT 1;
```

---

## Secondary Metrics (Operational)

### Metric 4: Error Rate During Deployment
**Definition**: HTTP error rate (4xx/5xx) during traffic cutover

**Target**: <1% (triggers monitoring, >5% triggers rollback)

**Collection**: Real-time monitoring via RollbackCoordinator agent

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 2.2 "Error rates within acceptable thresholds (<1%)"

### Metric 5: Response Time (p95)
**Definition**: 95th percentile response time during deployment

**Target**: <500ms (SLA requirement)

**Collection**: Real-time monitoring via RollbackCoordinator agent

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 2.2 "Response times within SLA (<500ms p95)"

### Metric 6: Database Connection Pool Utilization
**Definition**: Percentage of database connections in use during deployment

**Target**: <80% (healthy state)

**Alert Threshold**: >90% (risk of connection exhaustion)

**Collection**: Supabase metrics API

---

## Alerting Configuration

### Alert 1: Deployment Failure
**Trigger**: `deployment_status = 'failed'` OR `deployment_status = 'rollback'`
**Channels**: Slack (#deployments), Email (Chairman, CTO)
**Priority**: P0 CRITICAL

**Slack Message Template**:
```
🚨 DEPLOYMENT FAILED 🚨
Version: {deployment_version}
Status: {deployment_status}
Rollback Reason: {rollback_reason}
Duration: {started_at} → {completed_at}
Action: Investigate deployment logs
```

### Alert 2: Downtime Detected
**Trigger**: `downtime_minutes > 0`
**Channels**: Slack (#incidents), Email (Chairman, CTO), PagerDuty (on-call)
**Priority**: P0 CRITICAL (SLA VIOLATION)

**Slack Message Template**:
```
🔥 DOWNTIME DETECTED 🔥
Downtime: {downtime_minutes} minutes
Deployment: {deployment_version}
Detected At: {downtime_detected_at}
Action: IMMEDIATE ROLLBACK + POST-MORTEM
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/07_recursion-blueprint.md:DEPLOY-003 "Downtime >0 minutes"

### Alert 3: Rollback Time SLA Breach
**Trigger**: `rollback_duration_minutes > 5`
**Channels**: Slack (#deployments), Email (CTO)
**Priority**: P1 HIGH

**Slack Message Template**:
```
⚠️ ROLLBACK SLA BREACH ⚠️
Rollback Time: {rollback_duration_minutes} minutes (target: <5 minutes)
Rollback Type: {rollback_type}
Rollback Trigger: {rollback_trigger}
Action: Optimize rollback automation
```

---

## Monitoring Stack (Proposed)

**Application Metrics**: Prometheus + Grafana (or Supabase Dashboard)
**Error Tracking**: Sentry
**Log Aggregation**: AWS CloudWatch (or Supabase Logs)
**Uptime Monitoring**: UptimeRobot (or Pingdom)
**Alerting**: PagerDuty + Slack + Email

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1356 "Monitoring active"

---

## Metrics Integration with SD-METRICS-FRAMEWORK-001

**Strategic Directive**: SD-METRICS-FRAMEWORK-001 (P0 CRITICAL, status=queued)

**Integration Points**:
1. Deployment logs schema → SD-METRICS-FRAMEWORK-001 metrics tables
2. Rollback logs schema → SD-METRICS-FRAMEWORK-001 metrics tables
3. Dashboard queries → SD-METRICS-FRAMEWORK-001 unified dashboard
4. Alert configuration → SD-METRICS-FRAMEWORK-001 alerting system

**Gap**: Stage 30 metrics currently BLOCKED by SD-METRICS-FRAMEWORK-001 (universal blocker)

**Evidence**: Referenced across all stage dossiers as P0 prerequisite

---

## Supabase Function: Calculate Deployment Success Rate

**Function Name**: `calculate_deployment_success_rate`

**Purpose**: Calculate deployment success rate for dashboard queries

**Implementation**:
```sql
CREATE OR REPLACE FUNCTION calculate_deployment_success_rate(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  successful_deployments BIGINT,
  total_deployments BIGINT,
  success_rate_percent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE deployment_status = 'success') AS successful_deployments,
    COUNT(*) AS total_deployments,
    ROUND(
      (COUNT(*) FILTER (WHERE deployment_status = 'success')::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
      2
    ) AS success_rate_percent
  FROM deployment_logs
  WHERE started_at >= NOW() - (days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Usage**:
```sql
-- Last 30 days
SELECT * FROM calculate_deployment_success_rate(30);

-- Last 7 days
SELECT * FROM calculate_deployment_success_rate(7);
```

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Metrics definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1346-1349 | KPI specification |
| Monitoring gate | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1356 | Monitoring requirement |
| Error rate threshold | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-30/05_professional-sop.md | Step 2.2 | Alert threshold |
| Rollback time target | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-30/05_professional-sop.md | Section 3 | Rollback SLA |
| Downtime trigger | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-30/07_recursion-blueprint.md | DEPLOY-003 | Downtime alert |

---

**Next**: See `10_gaps-backlog.md` for identified gaps and proposed strategic directives.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
