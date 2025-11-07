# Stage 28: Configurability Matrix

## Overview

Stage 28 optimization thresholds, cache parameters, and profiling frequencies must be configurable to adapt to different venture scales and performance requirements.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-28.md:36-39 "Missing: Threshold values, measurement frequency"

---

## Configuration Parameters (12 Parameters)

### 1. Performance Thresholds

#### 1.1 Response Time Targets

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `api_p50_target_ms` | 50 | 10-200 | milliseconds | Median API response time target |
| `api_p95_target_ms` | 200 | 50-1000 | milliseconds | 95th percentile API response time target |
| `api_p99_target_ms` | 500 | 100-2000 | milliseconds | 99th percentile API response time target |
| `page_load_target_ms` | 1000 | 500-5000 | milliseconds | Full page load time target (TTI) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1254 "metrics: - Response time"

**Rationale**: Different ventures have different performance SLAs (e.g., real-time chat vs. batch reporting)

---

#### 1.2 Cache Performance

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `cache_hit_rate_target` | 0.70 | 0.50-0.95 | ratio | Minimum acceptable cache hit rate (70%) |
| `cache_miss_penalty_ms` | 100 | 10-500 | milliseconds | Max acceptable delay on cache miss |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1255 "metrics: - Cache hit rate"

---

#### 1.3 Resource Utilization

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `cpu_utilization_warning` | 0.70 | 0.50-0.85 | ratio | CPU usage warning threshold (70%) |
| `cpu_utilization_critical` | 0.90 | 0.80-0.95 | ratio | CPU usage critical threshold (90%) |
| `memory_utilization_warning` | 0.80 | 0.60-0.90 | ratio | Memory usage warning threshold (80%) |
| `memory_utilization_critical` | 0.95 | 0.90-0.98 | ratio | Memory usage critical threshold (95%) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1256 "metrics: - Resource utilization"

---

### 2. Cache Configuration

#### 2.1 Time-to-Live (TTL)

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `cache_ttl_short` | 300 | 60-600 | seconds | TTL for frequently changing data (5 min) |
| `cache_ttl_medium` | 3600 | 600-7200 | seconds | TTL for moderately stable data (1 hour) |
| `cache_ttl_long` | 86400 | 3600-604800 | seconds | TTL for stable data (24 hours) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1275-1278 "Cache Implementation: Cache strategy defined, Layers implemented"

**Example**:
- **Short TTL**: Venture status, real-time analytics
- **Medium TTL**: User profiles, static metadata
- **Long TTL**: Reference data, country lists

---

#### 2.2 Cache Invalidation

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `invalidation_strategy` | event-driven | [manual, scheduled, event-driven, write-through] | enum | Cache invalidation approach |
| `invalidation_delay_ms` | 0 | 0-1000 | milliseconds | Delay before purging cache after write |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1278 "Invalidation configured"

---

### 3. Profiling & Monitoring

#### 3.1 Profiling Frequency

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `profiling_interval_seconds` | 300 | 60-3600 | seconds | How often to run performance profiling (5 min) |
| `profiling_sample_rate` | 0.10 | 0.01-1.0 | ratio | Percentage of requests to profile (10%) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1269-1272 "Performance Analysis: Profiling complete"

**Rationale**: Continuous profiling adds overhead; sample rate balances visibility vs. performance

---

#### 3.2 Metrics Retention

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `metrics_retention_days` | 30 | 7-365 | days | How long to retain performance metrics |
| `metrics_aggregation_interval` | 60 | 10-300 | seconds | Granularity of metric aggregation (1 min) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-28.md:38 "measurement frequency"

---

### 4. Optimization Behavior

#### 4.1 Retry Limits

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `max_profiling_retries` | 3 | 1-5 | count | Max attempts to re-profile (Substage 28.1 loop) |
| `max_cache_retries` | 2 | 1-5 | count | Max attempts to redesign cache (Substage 28.2 loop) |
| `max_optimization_retries` | 3 | 1-5 | count | Max attempts to optimize code (Substage 28.3 loop) |

**Evidence**: Proposed in EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-28/07_recursion-blueprint.md "Recursion Metrics"

---

#### 4.2 Escalation Triggers

| Parameter | Default | Range | Unit | Description |
|-----------|---------|-------|------|-------------|
| `escalate_to_sd_after_retries` | 3 | 2-5 | count | Create Strategic Directive after N failed recursions |
| `max_stage_duration_days` | 14 | 3-30 | days | Max time in Stage 28 before Chairman intervention |

**Evidence**: Proposed in EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-28/07_recursion-blueprint.md "Recursion Metrics"

---

## Configuration Storage

### Database Schema (Proposed)

```sql
CREATE TABLE stage_28_config (
  venture_id UUID PRIMARY KEY REFERENCES ventures(id),

  -- Performance thresholds
  api_p50_target_ms INT DEFAULT 50,
  api_p95_target_ms INT DEFAULT 200,
  api_p99_target_ms INT DEFAULT 500,
  page_load_target_ms INT DEFAULT 1000,

  -- Cache performance
  cache_hit_rate_target DECIMAL(3,2) DEFAULT 0.70,
  cache_miss_penalty_ms INT DEFAULT 100,

  -- Resource utilization
  cpu_utilization_warning DECIMAL(3,2) DEFAULT 0.70,
  cpu_utilization_critical DECIMAL(3,2) DEFAULT 0.90,
  memory_utilization_warning DECIMAL(3,2) DEFAULT 0.80,
  memory_utilization_critical DECIMAL(3,2) DEFAULT 0.95,

  -- Cache TTL
  cache_ttl_short INT DEFAULT 300,
  cache_ttl_medium INT DEFAULT 3600,
  cache_ttl_long INT DEFAULT 86400,

  -- Invalidation
  invalidation_strategy TEXT DEFAULT 'event-driven',
  invalidation_delay_ms INT DEFAULT 0,

  -- Profiling
  profiling_interval_seconds INT DEFAULT 300,
  profiling_sample_rate DECIMAL(4,3) DEFAULT 0.100,

  -- Metrics retention
  metrics_retention_days INT DEFAULT 30,
  metrics_aggregation_interval INT DEFAULT 60,

  -- Retry limits
  max_profiling_retries INT DEFAULT 3,
  max_cache_retries INT DEFAULT 2,
  max_optimization_retries INT DEFAULT 3,

  -- Escalation
  escalate_to_sd_after_retries INT DEFAULT 3,
  max_stage_duration_days INT DEFAULT 14,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Storage Location**: Supabase database (per-venture configuration)

**Default Inheritance**: If no venture-specific config exists, use table defaults

---

## Configuration UI (Proposed)

### Admin Interface

**Location**: `/admin/ventures/:id/stage-28-config`

**Fields** (grouped by category):
1. **Performance Targets**: Sliders for P50/P95/P99 response times
2. **Cache Settings**: TTL inputs, invalidation strategy dropdown
3. **Resource Limits**: CPU/memory threshold sliders
4. **Profiling**: Sample rate slider, interval input
5. **Retry Behavior**: Retry limit inputs, escalation threshold

**Validation**:
- Ensure P50 < P95 < P99 (response times)
- Ensure warning < critical (resource utilization)
- Range validation per parameter (see table above)

---

## Configuration Overrides

### Global Defaults (System-Wide)

**File**: `config/stage-28-defaults.json`

```json
{
  "api_p95_target_ms": 200,
  "cache_hit_rate_target": 0.70,
  "cpu_utilization_critical": 0.90,
  "profiling_sample_rate": 0.10
}
```

**Use Case**: Set organization-wide performance standards

---

### Venture-Specific Overrides

**Database**: `stage_28_config` table (venture_id FK)

**Query**:
```sql
SELECT * FROM stage_28_config WHERE venture_id = 'venture-uuid';
```

**Fallback**: If no row exists, use global defaults

---

### Stage-Specific Overrides (Per Substage)

**Example**: Different cache TTL for Substage 28.2 vs. final optimized state

**Storage**: Add `substage_overrides JSONB` column to `stage_28_config`

```json
{
  "28.2": {
    "cache_ttl_short": 60,
    "cache_hit_rate_target": 0.50
  }
}
```

**Rationale**: Lower targets during implementation phase; raise after optimization

---

## Gap Analysis

**Missing Components**:
1. ❌ No `stage_28_config` table exists in database schema
2. ❌ No admin UI for configuration management
3. ❌ No validation logic for parameter ranges
4. ❌ No documentation of default values in stages.yaml

**Impact**: Cannot tune performance thresholds per venture; all ventures use hardcoded values

**Recommendations**:
1. Create `stage_28_config` table migration
2. Build admin UI for config management
3. Integrate config into Bottleneck Analyst Agent logic
4. Document defaults in stages.yaml `notes` field

**Priority**: High (required for multi-venture optimization)

**Documented In**: `10_gaps-backlog.md`

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Metrics definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1254-1257 |
| Substage done_when | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1269-1284 |
| Missing thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-28.md | 36-39 |
| Recursion metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-28/07_recursion-blueprint.md | N/A |

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
