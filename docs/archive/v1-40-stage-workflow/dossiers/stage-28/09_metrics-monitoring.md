---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 28: Metrics & Monitoring


## Table of Contents

- [Key Performance Indicators (KPIs)](#key-performance-indicators-kpis)
- [1. Response Time Metrics](#1-response-time-metrics)
  - [1.1 API Response Time](#11-api-response-time)
  - [1.2 Page Load Time](#12-page-load-time)
- [2. Cache Performance Metrics](#2-cache-performance-metrics)
  - [2.1 Cache Hit Rate](#21-cache-hit-rate)
  - [2.2 Cache Miss Penalty](#22-cache-miss-penalty)
- [3. Resource Utilization Metrics](#3-resource-utilization-metrics)
  - [3.1 CPU Utilization](#31-cpu-utilization)
  - [3.2 Memory Utilization](#32-memory-utilization)
  - [3.3 Database Connection Pool](#33-database-connection-pool)
- [4. Bottleneck Identification Metrics](#4-bottleneck-identification-metrics)
  - [4.1 Slow Query Log](#41-slow-query-log)
  - [4.2 Hot Path Execution Count](#42-hot-path-execution-count)
- [Database Schema (Proposed)](#database-schema-proposed)
  - [Performance Metrics Table](#performance-metrics-table)
  - [Cache Metrics Table](#cache-metrics-table)
  - [Resource Metrics Table](#resource-metrics-table)
  - [Slow Query Log Table](#slow-query-log-table)
- [Monitoring Dashboard (Proposed)](#monitoring-dashboard-proposed)
  - [Supabase Dashboard Configuration](#supabase-dashboard-configuration)
- [Integration with APM Tools](#integration-with-apm-tools)
  - [New Relic Integration (Example)](#new-relic-integration-example)
- [Alert Configuration](#alert-configuration)
  - [Alert Rules (4 rules)](#alert-rules-4-rules)
- [Gap Analysis](#gap-analysis)
- [Sources Table](#sources-table)

## Key Performance Indicators (KPIs)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1254-1257 "metrics: Response time, Cache hit rate, Resource utilization"

---

## 1. Response Time Metrics

### 1.1 API Response Time

**Metric**: `api_response_time_ms`
**Type**: Histogram (P50, P95, P99)
**Unit**: Milliseconds
**Target**: P95 < 200ms, P99 < 500ms

**Supabase Query**:
```sql
-- Query performance_metrics table (proposed)
SELECT
  venture_id,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY response_time_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time_ms) AS p99
FROM performance_metrics
WHERE venture_id = 'venture-uuid'
  AND measured_at > NOW() - INTERVAL '1 hour'
GROUP BY venture_id;
```

**Dashboard**: Real-time response time chart (1-hour rolling window)

**Alert**: Trigger if P95 > 200ms for 5 consecutive minutes

---

### 1.2 Page Load Time

**Metric**: `page_load_time_ms`
**Type**: Histogram (P50, P75, P95)
**Unit**: Milliseconds
**Target**: P75 < 1000ms (1 second TTI)

**Collection Method**: Lighthouse CI or Real User Monitoring (RUM)

**Supabase Query**:
```sql
SELECT
  page_url,
  AVG(load_time_ms) AS avg_load_time,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY load_time_ms) AS p75
FROM frontend_metrics
WHERE venture_id = 'venture-uuid'
  AND measured_at > NOW() - INTERVAL '1 day'
GROUP BY page_url
ORDER BY avg_load_time DESC
LIMIT 10;
```

**Dashboard**: Slowest pages report

---

## 2. Cache Performance Metrics

### 2.1 Cache Hit Rate

**Metric**: `cache_hit_rate`
**Type**: Ratio (hits / total requests)
**Unit**: Percentage (0-100%)
**Target**: ≥70%

**Calculation**:
```sql
SELECT
  cache_layer_name,
  SUM(hits)::DECIMAL / SUM(hits + misses) AS hit_rate,
  SUM(hits) AS total_hits,
  SUM(misses) AS total_misses
FROM cache_metrics
WHERE venture_id = 'venture-uuid'
  AND measured_at > NOW() - INTERVAL '1 hour'
GROUP BY cache_layer_name;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1255 "Cache hit rate"

**Dashboard**: Cache hit rate by layer (Redis, CDN, browser cache)

**Alert**: Trigger if hit rate < 70% for any layer

---

### 2.2 Cache Miss Penalty

**Metric**: `cache_miss_avg_delay_ms`
**Type**: Average
**Unit**: Milliseconds
**Target**: < 100ms

**Calculation**:
```sql
SELECT
  cache_layer_name,
  AVG(miss_response_time_ms) AS avg_miss_delay
FROM cache_metrics
WHERE venture_id = 'venture-uuid'
  AND measured_at > NOW() - INTERVAL '1 hour'
  AND misses > 0
GROUP BY cache_layer_name;
```

**Dashboard**: Average delay on cache miss

---

## 3. Resource Utilization Metrics

### 3.1 CPU Utilization

**Metric**: `cpu_utilization_percent`
**Type**: Gauge (current value)
**Unit**: Percentage (0-100%)
**Target**: < 70% average, < 90% peak

**Supabase Query**:
```sql
SELECT
  server_instance,
  AVG(cpu_percent) AS avg_cpu,
  MAX(cpu_percent) AS peak_cpu
FROM resource_metrics
WHERE venture_id = 'venture-uuid'
  AND resource_type = 'cpu'
  AND measured_at > NOW() - INTERVAL '1 hour'
GROUP BY server_instance;
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1256 "Resource utilization"

**Dashboard**: CPU usage timeline per instance

**Alert**: Trigger if avg > 70% OR peak > 90% for 5 minutes

---

### 3.2 Memory Utilization

**Metric**: `memory_utilization_percent`
**Type**: Gauge
**Unit**: Percentage (0-100%)
**Target**: < 80% average, < 95% peak

**Supabase Query**:
```sql
SELECT
  server_instance,
  AVG(memory_percent) AS avg_memory,
  MAX(memory_percent) AS peak_memory
FROM resource_metrics
WHERE venture_id = 'venture-uuid'
  AND resource_type = 'memory'
  AND measured_at > NOW() - INTERVAL '1 hour'
GROUP BY server_instance;
```

**Dashboard**: Memory usage timeline + leak detection

**Alert**: Trigger if avg > 80% OR peak > 95% for 5 minutes

---

### 3.3 Database Connection Pool

**Metric**: `db_connection_pool_usage_percent`
**Type**: Gauge
**Unit**: Percentage (0-100%)
**Target**: < 80%

**Supabase Query** (using Supabase internal monitoring):
```sql
SELECT
  (COUNT(*) FILTER (WHERE state = 'active')::DECIMAL /
   current_setting('max_connections')::INT) * 100 AS pool_usage_percent
FROM pg_stat_activity
WHERE datname = 'your_database';
```

**Dashboard**: Connection pool utilization

**Alert**: Trigger if > 80% for 5 minutes

---

## 4. Bottleneck Identification Metrics

### 4.1 Slow Query Log

**Metric**: `slow_query_count`
**Type**: Counter
**Unit**: Count
**Target**: 0 queries > 1 second

**Supabase Query**:
```sql
SELECT
  query_id,
  query_text,
  AVG(execution_time_ms) AS avg_time,
  COUNT(*) AS execution_count
FROM slow_query_log
WHERE venture_id = 'venture-uuid'
  AND execution_time_ms > 1000
  AND logged_at > NOW() - INTERVAL '1 day'
GROUP BY query_id, query_text
ORDER BY avg_time DESC
LIMIT 20;
```

**Dashboard**: Top 20 slowest queries

**Alert**: Trigger if new query appears with avg_time > 1000ms

---

### 4.2 Hot Path Execution Count

**Metric**: `hot_path_execution_count`
**Type**: Counter
**Unit**: Count
**Target**: N/A (informational)

**Supabase Query**:
```sql
SELECT
  function_name,
  SUM(execution_count) AS total_executions,
  AVG(avg_execution_time_ms) AS avg_time
FROM profiling_data
WHERE venture_id = 'venture-uuid'
  AND profiled_at > NOW() - INTERVAL '1 day'
GROUP BY function_name
ORDER BY total_executions DESC
LIMIT 20;
```

**Dashboard**: Most frequently called functions

**Use Case**: Identify optimization targets (high execution count + high avg time)

---

## Database Schema (Proposed)

### Performance Metrics Table

```sql
CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL, -- 'api_response', 'page_load', etc.
  response_time_ms INT NOT NULL,
  endpoint TEXT,
  status_code INT,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  target_response_time_ms INT,
  INDEX idx_perf_venture_time (venture_id, measured_at)
);
```

---

### Cache Metrics Table

```sql
CREATE TABLE cache_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  cache_layer_name TEXT NOT NULL, -- 'redis', 'cdn', 'browser'
  hits INT DEFAULT 0,
  misses INT DEFAULT 0,
  hit_rate_percent DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN (hits + misses) > 0
    THEN (hits::DECIMAL / (hits + misses)) * 100
    ELSE 0 END
  ) STORED,
  miss_response_time_ms INT,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_cache_venture_time (venture_id, measured_at)
);
```

---

### Resource Metrics Table

```sql
CREATE TABLE resource_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  server_instance TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'cpu', 'memory', 'disk'
  utilization_percent DECIMAL(5,2) NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_resource_venture_time (venture_id, measured_at)
);
```

---

### Slow Query Log Table

```sql
CREATE TABLE slow_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  query_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  execution_time_ms INT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_slow_query_venture (venture_id, execution_time_ms)
);
```

---

## Monitoring Dashboard (Proposed)

### Supabase Dashboard Configuration

**Dashboard Name**: Stage 28 Performance Monitor

**Panels** (6 panels):

1. **Response Time Chart**
   - Metric: `api_response_time_ms` (P50, P95, P99)
   - Visualization: Line chart (1-hour rolling)
   - Threshold lines: P95 target (200ms), P99 target (500ms)

2. **Cache Hit Rate Gauge**
   - Metric: `cache_hit_rate`
   - Visualization: Gauge (0-100%)
   - Color coding: Green ≥70%, Yellow 50-70%, Red <50%

3. **Resource Utilization Heatmap**
   - Metric: `cpu_utilization_percent`, `memory_utilization_percent`
   - Visualization: Heatmap by server instance
   - Threshold lines: Warning (70% CPU, 80% memory), Critical (90% CPU, 95% memory)

4. **Slow Query Table**
   - Metric: `slow_query_count`
   - Visualization: Table (top 20 queries)
   - Columns: Query text, Avg time, Execution count

5. **Hot Path Ranking**
   - Metric: `hot_path_execution_count`
   - Visualization: Bar chart (top 20 functions)
   - Sorting: By total execution count * avg time (impact score)

6. **Stage 28 Exit Gate Status**
   - Metric: Composite (all metrics vs. targets)
   - Visualization: Checklist
   - Items: Performance targets met ✅/❌, Caching optimized ✅/❌, Best practices applied ✅/❌

---

## Integration with APM Tools

### New Relic Integration (Example)

**Configuration**: Add New Relic agent to Node.js app

```javascript
// newrelic.js
exports.config = {
  app_name: ['EHG Venture Platform'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: { level: 'info' },
  transaction_tracer: {
    enabled: true,
    record_sql: 'obfuscated',
    explain_threshold: 500, // ms
  },
};
```

**Custom Metrics**:
```javascript
const newrelic = require('newrelic');

// Record custom metrics in Stage 28
newrelic.recordMetric('Custom/Stage28/CacheHitRate', cacheHitRate);
newrelic.recordMetric('Custom/Stage28/P95ResponseTime', p95ResponseTime);
```

**Dashboard Link**: New Relic dashboard synced to Supabase via webhook

---

## Alert Configuration

### Alert Rules (4 rules)

1. **Performance Degradation Alert**
   - **Condition**: P95 response time > 200ms for 5 consecutive minutes
   - **Action**: Trigger recursion to Substage 28.1 (PERF-001)
   - **Notification**: Email + Slack #performance-alerts

2. **Cache Failure Alert**
   - **Condition**: Cache hit rate < 70% for 15 minutes
   - **Action**: Trigger recursion to Substage 28.2 (PERF-002)
   - **Notification**: Email + Slack #performance-alerts

3. **Resource Critical Alert**
   - **Condition**: CPU > 90% OR Memory > 95% for 10 minutes
   - **Action**: Trigger recursion to Substage 28.3 (PERF-003)
   - **Notification**: Email + PagerDuty (critical)

4. **Exit Gate Passed Alert**
   - **Condition**: All targets met for 1 hour
   - **Action**: Auto-advance to Stage 29 (PERF-004)
   - **Notification**: Email + Slack #stage-progression

**Evidence**: Recursion triggers defined in EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-28/07_recursion-blueprint.md

---

## Gap Analysis

**Missing Components**:
1. ❌ No `performance_metrics` table exists in database
2. ❌ No `cache_metrics` table exists in database
3. ❌ No `resource_metrics` table exists in database
4. ❌ No `slow_query_log` table exists in database
5. ❌ No Supabase dashboard configured
6. ❌ No APM tool integrated (New Relic/Datadog)
7. ❌ No alert rules defined in monitoring system

**Impact**: Cannot track Stage 28 KPIs; no data-driven optimization

**Recommendations**:
1. Create database migrations for metrics tables
2. Integrate APM tool (New Relic or Datadog)
3. Build Supabase dashboard with 6 panels
4. Configure alert rules in monitoring platform
5. Populate metrics via PerformanceOptimizationCrew agents

**Priority**: Critical (blocks Stage 28 execution)

**Documented In**: `10_gaps-backlog.md`

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Metrics definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1254-1257 |
| Recursion triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-28/07_recursion-blueprint.md | N/A |
| Configuration thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-28/08_configurability-matrix.md | N/A |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
