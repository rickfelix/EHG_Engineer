---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 27: Configurability Matrix


## Table of Contents

- [Configuration Philosophy](#configuration-philosophy)
- [Configuration Categories](#configuration-categories)
  - [1. Actor Configuration](#1-actor-configuration)
  - [2. Saga Configuration](#2-saga-configuration)
  - [3. Event Sourcing Configuration](#3-event-sourcing-configuration)
  - [4. Metrics & Monitoring Configuration](#4-metrics-monitoring-configuration)
  - [5. Recursion Trigger Configuration](#5-recursion-trigger-configuration)
- [Configuration Storage](#configuration-storage)
  - [Proposed Schema](#proposed-schema)
- [Configuration Validation](#configuration-validation)
- [Configuration Override Hierarchy](#configuration-override-hierarchy)
- [Configuration Change Management](#configuration-change-management)
- [Tuning Recommendations](#tuning-recommendations)
- [Sources Table](#sources-table)

**Stage**: Actor Model & Saga Transaction Integration
**Purpose**: Define tunable parameters for actor, saga, and event sourcing configuration
**Target**: Enable environment-specific tuning without code changes

---

## Configuration Philosophy

**Design Principle**: All thresholds, timeouts, and policies should be configurable via environment variables or database configuration tables.

**Rationale**:
- Development environments need shorter timeouts for fast feedback
- Production environments need higher thresholds for reliability
- Load testing environments need stress-test configurations

**Evidence**: Critique improvement "Define Clear Metrics - Missing: Threshold values, measurement frequency" (`EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-27.md:36-39`)

---

## Configuration Categories

### 1. Actor Configuration

| Parameter | Description | Default | Dev | Prod | Unit |
|-----------|-------------|---------|-----|------|------|
| `ACTOR_PASSIVATION_TIMEOUT` | Time before idle actor is passivated | 300 | 60 | 600 | seconds |
| `ACTOR_MESSAGE_TIMEOUT` | Max time for actor to process message | 30 | 10 | 60 | seconds |
| `ACTOR_RESTART_LIMIT` | Max restarts per time window before escalation | 5 | 3 | 10 | count |
| `ACTOR_RESTART_WINDOW` | Time window for restart limit | 60 | 30 | 120 | seconds |
| `ACTOR_MAILBOX_SIZE` | Max messages in actor mailbox before backpressure | 1000 | 100 | 5000 | count |
| `ACTOR_SNAPSHOT_INTERVAL` | Events between snapshots | 100 | 10 | 500 | count |

**Evidence**: Relates to substage 27.1 "Supervision configured" (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1226`)

---

### 2. Saga Configuration

| Parameter | Description | Default | Dev | Prod | Unit |
|-----------|-------------|---------|-----|------|------|
| `SAGA_STEP_TIMEOUT` | Max time for saga step to complete | 60 | 30 | 120 | seconds |
| `SAGA_TOTAL_TIMEOUT` | Max time for entire saga to complete | 300 | 120 | 600 | seconds |
| `SAGA_RETRY_LIMIT` | Max retries for failed saga step | 3 | 1 | 5 | count |
| `SAGA_RETRY_BACKOFF_BASE` | Base for exponential backoff (in seconds) | 2 | 1 | 5 | seconds |
| `SAGA_RETRY_BACKOFF_MAX` | Max backoff delay | 60 | 10 | 300 | seconds |
| `SAGA_COMPENSATION_TIMEOUT` | Max time for compensation to complete | 90 | 45 | 180 | seconds |
| `SAGA_COMPENSATION_RETRY_LIMIT` | Max retries for failed compensation | 5 | 2 | 10 | count |
| `SAGA_IDEMPOTENCY_TTL` | Time to keep idempotency keys | 86400 | 3600 | 604800 | seconds |

**Evidence**: Relates to substage 27.2 "Saga Orchestration" and improvement "Add Rollback Procedures" (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1227-1232` and `docs/workflow/critique/stage-27.md:47-50`)

---

### 3. Event Sourcing Configuration

| Parameter | Description | Default | Dev | Prod | Unit |
|-----------|-------------|---------|-----|------|------|
| `EVENT_BATCH_SIZE` | Events to write in single batch | 100 | 10 | 500 | count |
| `EVENT_REPLAY_BATCH_SIZE` | Events to replay in single batch | 50 | 5 | 200 | count |
| `EVENT_SNAPSHOT_INTERVAL` | Events between snapshots | 100 | 10 | 500 | count |
| `EVENT_SNAPSHOT_RETENTION` | Number of snapshots to retain | 10 | 3 | 50 | count |
| `EVENT_RETENTION_DAYS` | Days to retain events before archival | 365 | 30 | 2555 | days |
| `EVENT_ARCHIVE_BATCH_SIZE` | Events to archive in single batch | 1000 | 100 | 5000 | count |

**Evidence**: Relates to output "Event sourcing" (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1207`)

---

### 4. Metrics & Monitoring Configuration

| Parameter | Description | Default | Dev | Prod | Unit |
|-----------|-------------|---------|-----|------|------|
| `METRIC_TRANSACTION_SUCCESS_THRESHOLD` | Min transaction success rate before alert | 0.995 | 0.90 | 0.995 | ratio |
| `METRIC_LATENCY_P95_THRESHOLD` | Max p95 latency before alert | 200 | 500 | 200 | milliseconds |
| `METRIC_LATENCY_P99_THRESHOLD` | Max p99 latency before alert | 500 | 1000 | 500 | milliseconds |
| `METRIC_CONSISTENCY_THRESHOLD` | Min consistency score before alert | 0.999 | 0.95 | 0.999 | ratio |
| `METRIC_WINDOW_SIZE` | Time window for metric aggregation | 300 | 60 | 600 | seconds |
| `METRIC_SCRAPE_INTERVAL` | Prometheus scrape interval | 15 | 5 | 15 | seconds |

**Evidence**: Relates to metrics "Transaction success rate, Latency metrics, Consistency score" (`EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1208-1211`)

---

### 5. Recursion Trigger Configuration

| Parameter | Description | Default | Dev | Prod | Unit |
|-----------|-------------|---------|-----|------|------|
| `RECURSION_SAGA001_SUCCESS_THRESHOLD` | Transaction success rate trigger for SAGA-001 | 0.95 | 0.80 | 0.95 | ratio |
| `RECURSION_SAGA001_WINDOW` | Time window for SAGA-001 detection | 300 | 60 | 600 | seconds |
| `RECURSION_SAGA002_RETRY_LIMIT` | Compensation retry limit before SAGA-002 | 3 | 1 | 5 | count |
| `RECURSION_SAGA003_RESTART_LIMIT` | Actor restart limit before SAGA-003 | 5 | 3 | 10 | count |
| `RECURSION_SAGA003_RESTART_WINDOW` | Time window for SAGA-003 detection | 60 | 30 | 120 | seconds |
| `RECURSION_SAGA004_CONSISTENCY_THRESHOLD` | Consistency score for SAGA-004 success | 0.999 | 0.95 | 0.999 | ratio |
| `RECURSION_SAGA004_DURATION` | Sustained duration for SAGA-004 trigger | 86400 | 3600 | 86400 | seconds |
| `RECURSION_MAX_ITERATIONS` | Max recursion iterations per trigger type | 3 | 1 | 5 | count |

**Evidence**: Relates to recursion triggers defined in `07_recursion-blueprint.md`

---

## Configuration Storage

**Recommended Approach**: Database configuration table

### Proposed Schema

```sql
CREATE TABLE stage_27_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_name TEXT NOT NULL UNIQUE,
  parameter_value TEXT NOT NULL,
  parameter_type TEXT NOT NULL, -- 'string', 'number', 'boolean'
  environment TEXT NOT NULL DEFAULT 'production', -- 'development', 'production', 'test'
  description TEXT,
  unit TEXT, -- 'seconds', 'count', 'ratio', 'milliseconds', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_stage_27_config_env ON stage_27_config(environment);
CREATE INDEX idx_stage_27_config_name ON stage_27_config(parameter_name);
```

**Alternative Approach**: Environment variables (`.env` file)

```bash
# Actor Configuration
ACTOR_PASSIVATION_TIMEOUT=300
ACTOR_MESSAGE_TIMEOUT=30
ACTOR_RESTART_LIMIT=5

# Saga Configuration
SAGA_STEP_TIMEOUT=60
SAGA_RETRY_LIMIT=3

# Event Sourcing Configuration
EVENT_BATCH_SIZE=100
EVENT_SNAPSHOT_INTERVAL=100

# Metrics Configuration
METRIC_TRANSACTION_SUCCESS_THRESHOLD=0.995
METRIC_LATENCY_P95_THRESHOLD=200
```

---

## Configuration Validation

**Validation Rules**:

1. **Range checks**:
   - All timeout values: 1 ≤ value ≤ 3600 seconds
   - All count values: 1 ≤ value ≤ 10000
   - All ratio values: 0.0 ≤ value ≤ 1.0

2. **Dependency checks**:
   - `SAGA_TOTAL_TIMEOUT` ≥ `SAGA_STEP_TIMEOUT`
   - `SAGA_RETRY_BACKOFF_MAX` ≥ `SAGA_RETRY_BACKOFF_BASE`
   - `ACTOR_RESTART_WINDOW` ≥ 10 seconds

3. **Environment-specific rules**:
   - Development: Shorter timeouts for fast feedback
   - Production: Higher thresholds for stability
   - Test: Stress-test configurations for load testing

**Validation Script** (proposed):

```bash
# scripts/validate-stage-27-config.mjs
# Validates all Stage 27 configuration parameters
# Usage: node scripts/validate-stage-27-config.mjs --env=production
```

---

## Configuration Override Hierarchy

**Priority** (highest to lowest):

1. **Database configuration table** (runtime, hot-reloadable)
2. **Environment variables** (deployment-time, requires restart)
3. **Default values** (hardcoded in application, fallback)

**Example**:
- If `ACTOR_PASSIVATION_TIMEOUT` exists in database: use database value
- Else if `ACTOR_PASSIVATION_TIMEOUT` exists in `.env`: use environment variable
- Else: use default value (300 seconds)

---

## Configuration Change Management

**Process**:

1. **Propose Change**: Submit configuration change request (e.g., increase `SAGA_RETRY_LIMIT` from 3 to 5)
2. **Validate**: Run validation script to check for conflicts
3. **Test**: Apply change in development environment, verify behavior
4. **Review**: Human reviews impact (e.g., increased retry may delay compensation)
5. **Deploy**: Update configuration table in production
6. **Monitor**: Track metrics for 24 hours to confirm no regressions

**Rollback**: Revert to previous configuration value in database (keep audit trail with `updated_at` timestamps)

---

## Tuning Recommendations

**Common Scenarios**:

1. **High transaction volume**:
   - Increase `ACTOR_MAILBOX_SIZE` (reduce backpressure)
   - Increase `EVENT_BATCH_SIZE` (reduce write overhead)
   - Decrease `METRIC_SCRAPE_INTERVAL` (increase monitoring granularity)

2. **Slow downstream services**:
   - Increase `SAGA_STEP_TIMEOUT` (allow more time for external calls)
   - Increase `SAGA_RETRY_LIMIT` (handle transient failures)
   - Increase `SAGA_RETRY_BACKOFF_MAX` (avoid overwhelming downstream)

3. **Large actor state**:
   - Decrease `ACTOR_SNAPSHOT_INTERVAL` (reduce replay time)
   - Increase `ACTOR_PASSIVATION_TIMEOUT` (reduce snapshot churn)

4. **Debugging/troubleshooting**:
   - Decrease `RECURSION_SAGA001_SUCCESS_THRESHOLD` (trigger recursion more aggressively)
   - Increase `RECURSION_MAX_ITERATIONS` (allow more remediation attempts)

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Metrics missing thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 36-39 | "Missing: Threshold values, measurement frequency" |
| Supervision substage | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1226 | "done_when: - Supervision configured" |
| Saga orchestration substage | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1227-1232 | "Saga Orchestration - done_when: - Sagas designed..." |
| Rollback improvement | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-27.md | 47-50 | "Add Rollback Procedures - Required: Clear rollback triggers" |
| Event sourcing output | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1207 | "outputs: - Event sourcing" |
| Metrics list | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1208-1211 | "metrics: - Transaction success rate - Latency metrics - Consistency score" |
| Recursion blueprint | (This dossier) | N/A | 07_recursion-blueprint.md | N/A | "SAGA-001 through SAGA-004 triggers" |

---

**Next**: See `09_metrics-monitoring.md` for KPI definitions, Supabase queries, and dashboard specifications.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
