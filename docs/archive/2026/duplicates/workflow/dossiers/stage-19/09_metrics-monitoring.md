<!-- ARCHIVED: 2026-01-26T16:26:51.471Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-19\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 19: Metrics and Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Purpose

This document defines Stage 19 KPIs, measurement methods, SQL queries for metrics collection, and monitoring dashboard specifications.

**Evidence**: Stage 19 defines 3 metrics (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:840-843 "metrics: - Integration success rate - API reliability - Latency metrics")

## Stage 19 Metrics Overview

| Metric | Target | Criticality | Measurement Frequency | Data Source |
|--------|--------|-------------|----------------------|-------------|
| **Integration Success Rate** | ≥90% | HIGH | Per Stage 19 execution | Integration test results (Jest) |
| **API Reliability** | ≥99% | HIGH | Continuous (24-hour window) | API call logs (production monitoring) |
| **Latency Metrics (p95)** | <1000ms | HIGH | Per load test | k6 performance test results |

**Evidence**: Metrics align with Stage 19 canonical definition (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:840-843)

## Metric 1: Integration Success Rate

### Definition

**Integration Success Rate**: Percentage of API integration tests that pass (return expected results, no errors)

**Formula**: `(Passing integration tests / Total integration tests) × 100%`

**Target**: ≥90% (all critical APIs passing)
**Threshold**: <90% triggers recursion (see 07_recursion-blueprint.md, INTEGRATION-001)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:841 "Integration success rate"

### Measurement Method

**Tool**: Jest (integration test suite)
**Execution**: During Substage 19.1 (Integration Testing)
**Output**: JUnit XML, JSON (test results)

**Example Test Results**:
```json
{
  "numTotalTests": 20,
  "numPassedTests": 18,
  "numFailedTests": 2,
  "success_rate": 90.0
}
```

**Calculation**:
```sql
SELECT
  venture_id,
  total_tests,
  passing_tests,
  failing_tests,
  (passing_tests::FLOAT / NULLIF(total_tests, 0) * 100) AS integration_success_rate
FROM stage_19_integration_metrics
WHERE venture_id = 'VENTURE-001'
ORDER BY measured_at DESC
LIMIT 1;
```

**Expected Output**:
```
venture_id    | total_tests | passing_tests | failing_tests | integration_success_rate
VENTURE-001   | 20          | 18            | 2             | 90.00
```

**Interpretation**:
- **90.0%**: ✅ Meets threshold (≥90%), exit gate passes
- **85.0%**: ❌ Below threshold (<90%), triggers INTEGRATION-001 recursion

### Monitoring Dashboard

**Grafana Panel**: Integration Success Rate Trend (Last 30 Days)
```yaml
panel:
  title: "Integration Success Rate (Last 30 Days)"
  type: graph
  targets:
    - query: |
        SELECT
          measured_at AS time,
          integration_success_rate AS "Success Rate (%)"
        FROM stage_19_integration_metrics
        WHERE venture_id = '$venture_id'
          AND measured_at >= NOW() - INTERVAL '30 days'
        ORDER BY measured_at ASC
  thresholds:
    - value: 90
      color: green
    - value: 80
      color: yellow
    - value: 0
      color: red
```

**Alert Rule**: Integration Success Rate Below Threshold
```yaml
alert:
  name: IntegrationSuccessRateLow
  condition: integration_success_rate < 90
  for: 5m
  annotations:
    summary: "Integration success rate <90% for {{ $labels.venture_id }}"
    description: "Success rate is {{ $value }}% (threshold: ≥90%)"
  actions:
    - type: slack
      channel: "#api-alerts"
    - type: trigger_recursion
      target_stage: 19
      trigger_type: INTEGRATION-001
```

## Metric 2: API Reliability

### Definition

**API Reliability**: Percentage of API calls that succeed (return 2xx status codes, not 4xx/5xx errors)

**Formula**: `(Successful API calls / Total API calls) × 100%`

**Target**: ≥99% (99% uptime SLA)
**Threshold**: <99% triggers recursion (see 07_recursion-blueprint.md, INTEGRATION-002)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:842 "API reliability"

### Measurement Method

**Tool**: API call logging (production monitoring)
**Execution**: Continuous (24-hour rolling window)
**Output**: Database records (`api_call_logs` table)

**Example API Call Logs**:
```sql
CREATE TABLE api_call_logs (
  call_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  api_name VARCHAR(100),
  endpoint VARCHAR(255),
  status_code INT,
  response_time_ms FLOAT,
  called_at TIMESTAMP DEFAULT NOW()
);
```

**Calculation**:
```sql
WITH api_calls AS (
  SELECT
    venture_id,
    api_name,
    COUNT(*) AS total_calls,
    COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS successful_calls,
    COUNT(*) FILTER (WHERE status_code NOT BETWEEN 200 AND 299) AS failed_calls
  FROM api_call_logs
  WHERE venture_id = 'VENTURE-001'
    AND called_at >= NOW() - INTERVAL '24 hours'
  GROUP BY venture_id, api_name
)
SELECT
  venture_id,
  api_name,
  total_calls,
  successful_calls,
  failed_calls,
  (successful_calls::FLOAT / NULLIF(total_calls, 0) * 100) AS api_reliability_percentage
FROM api_calls;
```

**Expected Output**:
```
venture_id  | api_name | total_calls | successful_calls | failed_calls | api_reliability_percentage
VENTURE-001 | Stripe   | 1000        | 995              | 5            | 99.50
VENTURE-001 | Auth0    | 500         | 498              | 2            | 99.60
VENTURE-001 | OpenAI   | 200         | 190              | 10           | 95.00
```

**Interpretation**:
- **Stripe: 99.50%**: ✅ Meets threshold (≥99%)
- **Auth0: 99.60%**: ✅ Meets threshold (≥99%)
- **OpenAI: 95.00%**: ❌ Below threshold (<99%), triggers INTEGRATION-002 recursion

### Monitoring Dashboard

**Grafana Panel**: API Reliability by Service (24-Hour Window)
```yaml
panel:
  title: "API Reliability by Service (24-Hour Window)"
  type: bar
  targets:
    - query: |
        WITH api_calls AS (
          SELECT
            api_name,
            COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::FLOAT /
              NULLIF(COUNT(*), 0) * 100 AS reliability_percentage
          FROM api_call_logs
          WHERE venture_id = '$venture_id'
            AND called_at >= NOW() - INTERVAL '24 hours'
          GROUP BY api_name
        )
        SELECT api_name AS metric, reliability_percentage AS value
        FROM api_calls
  thresholds:
    - value: 99
      color: green
    - value: 95
      color: yellow
    - value: 0
      color: red
```

**Alert Rule**: API Reliability Below 99%
```yaml
alert:
  name: APIReliabilityLow
  condition: api_reliability_percentage < 99
  for: 15m
  annotations:
    summary: "API reliability <99% for {{ $labels.api_name }}"
    description: "Reliability is {{ $value }}% (threshold: ≥99%)"
  actions:
    - type: pagerduty
      severity: high
    - type: trigger_recursion
      target_stage: 19
      trigger_type: INTEGRATION-002
```

## Metric 3: Latency Metrics (p50, p95, p99)

### Definition

**Latency Metrics**: API response time percentiles (p50, p95, p99)
- **p50 (median)**: 50% of requests complete in this time or less
- **p95**: 95% of requests complete in this time or less
- **p99**: 99% of requests complete in this time or less

**Target**: p95 <1000ms (95% of requests complete in <1 second)
**Threshold**: p95 ≥1000ms triggers recursion (see 07_recursion-blueprint.md, INTEGRATION-003)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:843 "Latency metrics"

### Measurement Method

**Tool**: k6 (load testing)
**Execution**: During Substage 19.2 (Performance Validation)
**Output**: k6 JSON results

**Example k6 Results**:
```json
{
  "metrics": {
    "http_req_duration": {
      "values": {
        "p(50)": 150.5,
        "p(95)": 680.2,
        "p(99)": 1200.8
      }
    }
  }
}
```

**Calculation**:
```sql
SELECT
  venture_id,
  api_name,
  latency_p50_ms,
  latency_p95_ms,
  latency_p99_ms,
  CASE
    WHEN latency_p95_ms < 1000 THEN '✅ SLA met'
    ELSE '❌ SLA NOT met'
  END AS sla_status
FROM stage_19_performance_metrics
WHERE venture_id = 'VENTURE-001'
ORDER BY measured_at DESC
LIMIT 5;
```

**Expected Output**:
```
venture_id  | api_name | latency_p50_ms | latency_p95_ms | latency_p99_ms | sla_status
VENTURE-001 | Stripe   | 150.5          | 680.2          | 1200.8         | ✅ SLA met
VENTURE-001 | Auth0    | 95.3           | 450.1          | 850.4          | ✅ SLA met
VENTURE-001 | OpenAI   | 850.2          | 2500.5         | 4000.1         | ❌ SLA NOT met
```

**Interpretation**:
- **Stripe p95=680.2ms**: ✅ Meets threshold (<1000ms)
- **Auth0 p95=450.1ms**: ✅ Meets threshold (<1000ms)
- **OpenAI p95=2500.5ms**: ❌ Exceeds threshold (≥1000ms), triggers INTEGRATION-003 recursion

### Monitoring Dashboard

**Grafana Panel**: Latency Percentiles by API (Last 7 Days)
```yaml
panel:
  title: "API Latency Percentiles (Last 7 Days)"
  type: graph
  targets:
    - query: |
        SELECT
          measured_at AS time,
          api_name,
          latency_p50_ms AS "p50",
          latency_p95_ms AS "p95",
          latency_p99_ms AS "p99"
        FROM stage_19_performance_metrics
        WHERE venture_id = '$venture_id'
          AND measured_at >= NOW() - INTERVAL '7 days'
        ORDER BY measured_at ASC
  thresholds:
    - value: 1000
      color: red
      yaxis: p95
    - value: 500
      color: yellow
      yaxis: p95
    - value: 0
      color: green
      yaxis: p95
```

**Alert Rule**: Latency p95 Exceeds 1000ms
```yaml
alert:
  name: LatencyP95High
  condition: latency_p95_ms > 1000
  for: 10m
  annotations:
    summary: "API latency p95 >1000ms for {{ $labels.api_name }}"
    description: "p95 latency is {{ $value }}ms (threshold: <1000ms)"
  actions:
    - type: slack
      channel: "#performance-alerts"
    - type: trigger_recursion
      target_stage: 10  # Architecture review
      trigger_type: INTEGRATION-003
```

## Additional Monitoring Metrics

### Metric 4: Test Coverage (Substage 19.1)

**Definition**: Percentage of API endpoints covered by integration tests

**Formula**: `(Tested endpoints / Total endpoints) × 100%`

**Target**: ≥80% (80% of endpoints tested)

**Calculation**:
```sql
WITH endpoint_coverage AS (
  SELECT
    venture_id,
    COUNT(DISTINCT endpoint) AS total_endpoints,
    COUNT(DISTINCT endpoint) FILTER (WHERE has_test = true) AS tested_endpoints
  FROM api_endpoints
  WHERE venture_id = 'VENTURE-001'
  GROUP BY venture_id
)
SELECT
  venture_id,
  total_endpoints,
  tested_endpoints,
  (tested_endpoints::FLOAT / NULLIF(total_endpoints, 0) * 100) AS test_coverage_percentage
FROM endpoint_coverage;
```

### Metric 5: Circuit Breaker Activations (Substage 19.3)

**Definition**: Count of circuit breaker activations (API failures exceed threshold)

**Target**: 0 activations (all APIs reliable)

**Calculation**:
```sql
SELECT
  venture_id,
  api_name,
  COUNT(*) AS activation_count,
  MAX(opened_at) AS last_activation
FROM circuit_breaker_events
WHERE venture_id = 'VENTURE-001'
  AND circuit_breaker_status = 'open'
  AND opened_at >= NOW() - INTERVAL '24 hours'
GROUP BY venture_id, api_name;
```

**Alert**: If activation_count >3 in 24 hours → triggers INTEGRATION-004 recursion

### Metric 6: Error Rate by API

**Definition**: Percentage of API calls that return errors (4xx, 5xx status codes)

**Formula**: `(Failed API calls / Total API calls) × 100%`

**Target**: <1% (error rate <1%)

**Calculation**:
```sql
SELECT
  api_name,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status_code >= 400) AS error_calls,
  (COUNT(*) FILTER (WHERE status_code >= 400)::FLOAT / NULLIF(COUNT(*), 0) * 100) AS error_rate_percentage
FROM api_call_logs
WHERE venture_id = 'VENTURE-001'
  AND called_at >= NOW() - INTERVAL '1 hour'
GROUP BY api_name;
```

## Metrics Dashboard (Grafana)

### Dashboard Structure

**Dashboard Name**: Stage 19 - Integration Verification Metrics
**Refresh Interval**: 30 seconds
**Time Range**: Last 24 hours (default)

**Panels**:
1. **Integration Success Rate** (top-left, size: 1/4 width)
   - Type: Single stat
   - Query: Latest integration success rate
   - Threshold: ≥90% (green), <90% (red)

2. **API Reliability by Service** (top-right, size: 1/4 width)
   - Type: Bar chart
   - Query: API reliability (24-hour window)
   - Threshold: ≥99% (green), <99% (red)

3. **Latency Percentiles** (middle-left, size: 1/2 width)
   - Type: Line graph
   - Query: p50, p95, p99 latency (last 7 days)
   - Threshold: p95 <1000ms (green line)

4. **Circuit Breaker Activations** (middle-right, size: 1/2 width)
   - Type: Stat panel
   - Query: Circuit breaker activation count (24-hour window)
   - Threshold: 0 (green), >0 (red)

5. **Error Rate by API** (bottom, size: full width)
   - Type: Heatmap
   - Query: Error rate per API per hour (last 24 hours)
   - Threshold: <1% (green), ≥1% (yellow), ≥5% (red)

**Dashboard YAML**:
```yaml
dashboard:
  title: "Stage 19 - Integration Verification Metrics"
  refresh: "30s"
  time:
    from: "now-24h"
    to: "now"
  panels:
    - id: 1
      title: "Integration Success Rate"
      type: singlestat
      gridPos: { x: 0, y: 0, w: 6, h: 4 }
      targets:
        - query: "SELECT integration_success_rate FROM stage_19_integration_metrics WHERE venture_id = '$venture_id' ORDER BY measured_at DESC LIMIT 1"
      thresholds: "90,100"
      colors: ["red", "green", "green"]
    - id: 2
      title: "API Reliability by Service"
      type: bargauge
      gridPos: { x: 6, y: 0, w: 6, h: 4 }
      targets:
        - query: "WITH api_calls AS (SELECT api_name, COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::FLOAT / NULLIF(COUNT(*), 0) * 100 AS reliability FROM api_call_logs WHERE venture_id = '$venture_id' AND called_at >= NOW() - INTERVAL '24 hours' GROUP BY api_name) SELECT api_name AS metric, reliability AS value FROM api_calls"
      thresholds: "99,100"
      colors: ["red", "green", "green"]
```

## Metrics Export and Storage

### Database Schema

```sql
-- Stage 19 integration metrics (Metric 1)
CREATE TABLE stage_19_integration_metrics (
  metric_id UUID PRIMARY KEY,
  venture_id VARCHAR(50) NOT NULL,
  total_tests INT NOT NULL,
  passing_tests INT NOT NULL,
  failing_tests INT NOT NULL,
  integration_success_rate FLOAT NOT NULL,
  measured_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_venture_measured (venture_id, measured_at DESC)
);

-- Stage 19 performance metrics (Metric 3)
CREATE TABLE stage_19_performance_metrics (
  metric_id UUID PRIMARY KEY,
  venture_id VARCHAR(50) NOT NULL,
  api_name VARCHAR(100) NOT NULL,
  latency_p50_ms FLOAT NOT NULL,
  latency_p95_ms FLOAT NOT NULL,
  latency_p99_ms FLOAT NOT NULL,
  throughput_req_sec FLOAT,
  measured_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_venture_api_measured (venture_id, api_name, measured_at DESC)
);

-- API call logs (Metric 2, real-time monitoring)
CREATE TABLE api_call_logs (
  call_id UUID PRIMARY KEY,
  venture_id VARCHAR(50) NOT NULL,
  api_name VARCHAR(100) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  status_code INT NOT NULL,
  response_time_ms FLOAT NOT NULL,
  called_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_venture_api_called (venture_id, api_name, called_at DESC)
);
```

### Metrics Export Script

```bash
# Export Stage 19 metrics to database
node scripts/export-stage-19-metrics.js \
  --venture-id VENTURE-001 \
  --integration-results /mnt/c/_EHG/EHG_Engineer/integration-test-results.json \
  --performance-results /mnt/c/_EHG/EHG_Engineer/stripe-latency-results.json

# Expected: Metrics inserted into database tables
```

## Success Criteria

**Stage 19 Metrics Success Criteria** (Exit Gate Validation):
- ✅ Integration success rate ≥90%
- ✅ API reliability ≥99% (all critical APIs)
- ✅ Latency p95 <1000ms (all critical APIs)

**Evidence**: Aligns with Stage 19 exit gates (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:849-851)

---

**Conclusion**: Stage 19 metrics provide comprehensive visibility into integration health, enabling objective exit gate validation and automated recursion triggers.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
