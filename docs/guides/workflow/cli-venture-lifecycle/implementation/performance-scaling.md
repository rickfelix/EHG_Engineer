---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [guide, auto-generated]
---

## Table of Contents

- [Performance Targets](#performance-targets)
  - [Latency Budget Breakdown](#latency-budget-breakdown)
- [Query Performance Estimates](#query-performance-estimates)
  - [Per-Query Estimates](#per-query-estimates)
  - [Query Access Patterns](#query-access-patterns)
- [Database Index Strategy](#database-index-strategy)
  - [Index Inventory](#index-inventory)
  - [Partial Index Design](#partial-index-design)
  - [Index vs. Write Tradeoff](#index-vs-write-tradeoff)
- [Scaling Considerations](#scaling-considerations)
  - [N+1 Query Prevention](#n1-query-prevention)
  - [Event Queue Management](#event-queue-management)
  - [LLM Token Budgets](#llm-token-budgets)
  - [Stage Template Caching](#stage-template-caching)
  - [Preference Caching](#preference-caching)
- [Bottleneck Analysis](#bottleneck-analysis)
  - [Primary Bottleneck: LLM API Latency](#primary-bottleneck-llm-api-latency)
  - [Secondary Bottleneck: Database Round-Trips](#secondary-bottleneck-database-round-trips)
  - [Idempotency as Performance Feature](#idempotency-as-performance-feature)
- [Monitoring Recommendations](#monitoring-recommendations)
  - [Query Performance Monitoring](#query-performance-monitoring)
  - [Token Usage Tracking](#token-usage-tracking)
  - [Event Queue Health](#event-queue-health)
  - [Table Bloat Monitoring](#table-bloat-monitoring)
  - [Dashboard Metrics](#dashboard-metrics)
- [Capacity Planning](#capacity-planning)
  - [Growth Projections](#growth-projections)
  - [When to Consider Optimization](#when-to-consider-optimization)

---
Category: Implementation
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, implementation]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Performance and Scaling Reference

This document describes performance targets, query performance characteristics, index strategy, scaling considerations, bottleneck analysis, and monitoring recommendations for the Eva Orchestrator CLI Venture Lifecycle system.

## Performance Targets

| Operation | Target Latency | Measured At | Notes |
|-----------|---------------|-------------|-------|
| Stage execution (total) | < 10 seconds | End-to-end, excluding LLM | Includes all DB ops, gates, filters |
| Database query (single) | < 50 ms | Per-query | Indexed lookups |
| Gate evaluation | < 100 ms | Per-gate | Includes DB reads for artifact quality |
| Template loading | < 50 ms | Dynamic import | Cached after first load |
| Decision filter evaluation | < 100 ms | Per-evaluation | Includes preference resolution |
| Artifact persistence | < 50 ms | Per-artifact | Single row insert |
| Transition recording | < 50 ms | Per-transition | Includes idempotency check |
| Event emission | < 20 ms | Per-event | Simple insert |

### Latency Budget Breakdown

```
+------------------------------------------------------------------+
|                Stage Execution Latency Budget                     |
|                (10 seconds max, excluding LLM)                    |
+------------------------------------------------------------------+
|                                                                    |
|  Template Loading          |████|                        50ms     |
|  Context Loading           |████████|                    100ms    |
|  Dependency Check          |████|                        50ms     |
|  Decision Filter           |████████|                    100ms    |
|  Reality Gate Evaluation   |████████|                    100ms    |
|  Devil's Advocate Check    |████|                        50ms     |
|  Artifact Persistence      |████████████|                150ms    |
|  Transition Recording      |████████|                    100ms    |
|  Event Emission            |████|                        50ms     |
|  State Machine Update      |████|                        50ms     |
|  ─────────────────────────────────────────────────                |
|  Total DB/Compute Budget                                 800ms    |
|  Headroom for spikes                                     9200ms   |
|                                                                    |
+------------------------------------------------------------------+
```

The 800ms compute budget uses only 8% of the 10-second target, leaving substantial headroom for connection pool contention, network jitter, and unexpected load.

## Query Performance Estimates

Performance estimates assume the following data volumes (moderate scale):

| Table | Row Count | Growth Rate |
|-------|-----------|-------------|
| ventures | 1,000 | ~10/week |
| venture_artifacts | 50,000 | ~50/venture (5 artifacts x 10 stages avg) |
| venture_stage_transitions | 10,000 | ~10/venture |
| lifecycle_stage_config | 25 | Static (seeded once) |
| eva_events | 100,000 | ~100/venture (varies by activity) |
| eva_decisions | 5,000 | ~5/venture |
| eva_audit_log | 200,000 | High volume (all operations logged) |
| chairman_preferences | 500 | ~50/chairman x 10 chairmen |
| chairman_decisions | 2,000 | Subset of eva_decisions |

### Per-Query Estimates

| Query | Expected Latency | Index Used | Access Pattern |
|-------|-----------------|------------|----------------|
| Load venture by ID | < 1 ms | PK (id) | Single row by UUID |
| Load venture by code | < 1 ms | idx_ventures_code | Single row by unique index |
| Load stage config | < 1 ms | PK (stage_number) | Single row, 25-row table |
| Load artifacts for stage | < 5 ms | idx_venture_artifacts_stage | ~5 rows (composite index) |
| Load current artifacts | < 5 ms | idx_venture_artifacts_current | Partial index (is_current=true) |
| Insert artifact | < 10 ms | N/A (write) | Single row insert |
| Insert transition | < 10 ms | idx_venture_stage_transitions_idempotency | Write + unique check |
| Insert event | < 5 ms | N/A (write) | Single row insert |
| Load unprocessed events | < 10 ms | idx_eva_events_unprocessed | Partial index (processed=false) |
| Load chairman preferences | < 5 ms | Unique constraint | 2-query batch pattern |
| Load venture decisions | < 10 ms | Venture FK + status filter | Filtered scan |

### Query Access Patterns

```
+------------------------------------------------------------------+
|              Hot Path (every stage execution)                      |
+------------------------------------------------------------------+
|                                                                    |
|  1. SELECT * FROM ventures WHERE id = $1                          |
|     Index: PK                          Latency: < 1ms             |
|                                                                    |
|  2. SELECT * FROM lifecycle_stage_config WHERE stage_number = $1  |
|     Index: PK                          Latency: < 1ms             |
|                                                                    |
|  3. SELECT * FROM venture_artifacts                                |
|     WHERE venture_id = $1 AND lifecycle_stage = $2                |
|     Index: idx_venture_artifacts_stage  Latency: < 5ms            |
|                                                                    |
|  4. INSERT INTO venture_artifacts (...)                            |
|     Index: N/A                         Latency: < 10ms            |
|                                                                    |
|  5. INSERT INTO venture_stage_transitions (...)                   |
|     Index: idempotency check           Latency: < 10ms            |
|                                                                    |
|  6. INSERT INTO eva_events (...)                                  |
|     Index: N/A                         Latency: < 5ms             |
|                                                                    |
|  Total Hot Path: ~32ms (well within 10s budget)                   |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|              Warm Path (conditional, not every stage)              |
+------------------------------------------------------------------+
|                                                                    |
|  Chairman preference resolution (2-query batch):                  |
|  - Query 1: venture-specific preferences       Latency: < 3ms    |
|  - Query 2: global preferences                 Latency: < 3ms    |
|                                                                    |
|  Decision creation:                                                |
|  - INSERT INTO eva_decisions (...)             Latency: < 10ms    |
|  - INSERT INTO chairman_decisions (...)        Latency: < 10ms    |
|                                                                    |
|  Audit logging:                                                    |
|  - INSERT INTO eva_audit_log (...)             Latency: < 5ms     |
|                                                                    |
+------------------------------------------------------------------+
```

## Database Index Strategy

### Index Inventory

#### ventures table

| Index | Columns | Type | Query Pattern |
|-------|---------|------|---------------|
| ventures_pkey | id | B-tree (PK) | Point lookup by UUID |
| idx_ventures_code | venture_code | B-tree (unique) | Lookup by human-readable code |
| idx_ventures_current_lifecycle_stage | current_lifecycle_stage | B-tree | Filter/group by stage |
| idx_ventures_stage_status | (current_lifecycle_stage, venture_status) | B-tree (composite) | Dashboard: ventures at stage X with status Y |

#### venture_artifacts table

| Index | Columns | Type | Query Pattern |
|-------|---------|------|---------------|
| venture_artifacts_pkey | id | B-tree (PK) | Point lookup by UUID |
| idx_venture_artifacts_venture | venture_id | B-tree | All artifacts for a venture |
| idx_venture_artifacts_stage | (venture_id, lifecycle_stage) | B-tree (composite) | Artifacts for a specific venture+stage |
| idx_venture_artifacts_current | (venture_id, is_current) WHERE is_current = true | B-tree (partial) | Only active artifacts |
| idx_venture_artifacts_quality_score | quality_score | B-tree | Quality threshold queries |

#### venture_stage_transitions table

| Index | Columns | Type | Query Pattern |
|-------|---------|------|---------------|
| venture_stage_transitions_pkey | id | B-tree (PK) | Point lookup |
| idx_venture_stage_transitions_venture | venture_id | B-tree | Transition history for a venture |
| idx_venture_stage_transitions_idempotency | (venture_id, idempotency_key) | B-tree (unique) | Duplicate prevention |

#### eva_events table

| Index | Columns | Type | Query Pattern |
|-------|---------|------|---------------|
| eva_events_pkey | id | B-tree (PK) | Point lookup |
| idx_eva_events_venture | venture_id | B-tree | Events for a venture |
| idx_eva_events_type | event_type | B-tree | Events by type |
| idx_eva_events_unprocessed | venture_id WHERE processed = false | B-tree (partial) | Event queue consumer |

### Partial Index Design

Two partial indexes reduce index size and improve write performance:

```
idx_venture_artifacts_current
    WHERE is_current = true

    Purpose: Most queries only need the current version of artifacts.
    Historical versions (is_current = false) are excluded from this index,
    keeping it small even as artifact versions accumulate.

    Estimated size: ~10% of full index (only current versions)

idx_eva_events_unprocessed
    WHERE processed = false

    Purpose: The event consumer only queries unprocessed events.
    Once processed, events are excluded from this index.

    Estimated size: Varies with processing lag, typically < 1% of total events.
    At steady state with active processing, this index contains very few rows.
```

### Index vs. Write Tradeoff

```
+------------------------------------------------------------------+
|              Index Write Overhead Analysis                         |
+------------------------------------------------------------------+
|                                                                    |
|  Table                  | Indexes | Write Overhead | Justified?   |
|  ───────────────────────┼─────────┼────────────────┼────────────  |
|  ventures               | 4       | Low            | Yes (reads   |
|                         |         |                | dominate)    |
|  venture_artifacts      | 5       | Medium         | Yes (partial |
|                         |         |                | indexes help)|
|  venture_stage_         | 3       | Low            | Yes (idempo- |
|  transitions            |         |                | tency req'd) |
|  eva_events             | 4       | Medium         | Yes (event   |
|                         |         |                | queue perf)  |
|  eva_audit_log          | 1       | Minimal        | Append-only  |
|  chairman_preferences   | 1+UC    | Minimal        | Low volume   |
|                                                                    |
+------------------------------------------------------------------+
```

The write overhead from indexes is acceptable because:
1. Write volume is moderate (not a high-throughput OLTP system)
2. Read performance on the hot path is critical for stage execution latency
3. Partial indexes minimize overhead for high-volume tables

## Scaling Considerations

### N+1 Query Prevention

The orchestrator uses batch loading to avoid N+1 queries:

```
ANTI-PATTERN (N+1):
    for each stage in stages:
        loadArtifacts(ventureId, stage.number)   // N queries

IMPLEMENTED PATTERN (batch):
    loadAllArtifactsForVenture(ventureId)         // 1 query
    groupBy(artifacts, 'lifecycle_stage')          // In-memory grouping
```

**Where batch loading is applied:**
- Artifact loading per stage (single query with stage filter)
- Chairman preference resolution (2-query batch: venture-specific + global)
- Stage config loading (all 25 stages loaded once during initialize)

### Event Queue Management

The `eva_events` table functions as an event queue. Without management, it grows unboundedly.

**Monitoring Threshold:** Alert when `eva_events` exceeds 100,000 rows.

**Mitigation Strategies:**

| Strategy | Trigger | Implementation |
|----------|---------|----------------|
| Process backlog | Unprocessed > 1,000 | Increase consumer throughput |
| Archive processed | Total > 100,000 | Move processed events to archive table |
| Purge old events | Processed events > 90 days old | DELETE with date filter |

```
Event Lifecycle:

    Created (processed=false)
        |
        v
    Consumed by orchestrator
        |
        v
    Marked processed (processed=true, processed_at=now())
        |
        v
    Archived (after 90 days, moved to eva_events_archive)
        |
        v
    Purged (after 365 days, deleted from archive)
```

### LLM Token Budgets

Each venture has a configurable token budget profile that controls LLM usage across stages:

| Profile | Total Budget | Per-Stage Average | Use Case |
|---------|-------------|-------------------|----------|
| Exploratory | 75,000 tokens | ~3,000/stage | Early-stage, quick validation |
| Standard | 375,000 tokens | ~15,000/stage | Normal lifecycle progression |
| Deep | 1,500,000 tokens | ~60,000/stage | Comprehensive analysis at each stage |

**Budget Tracking:**
- Per-stage token estimate stored in `STAGE_METADATA.estimatedTokens` (in stage templates)
- Actual usage tracked via LLM client response metadata
- Over-budget warning emitted as `eva_event` when cumulative usage exceeds profile

**Budget Enforcement:**
- Budgets are advisory, not hard-blocking
- Over-budget stages produce a warning event but still execute
- Chairman can review budget consumption and adjust profile

### Stage Template Caching

```
Template Loading Flow:

    getTemplate(stageNumber)
        |
        +-> Cache hit? -> Return cached template    (< 1ms)
        |
        +-> Cache miss -> Dynamic import()          (< 50ms)
                |
                +-> Validate schema
                |
                +-> Store in cache
                |
                +-> Return template
```

Templates are loaded via `import()` and cached in memory after first access. For the 25-stage lifecycle, worst case is 25 cache misses (~1.25s total), typically amortized across multiple `processStage()` calls during a session.

### Preference Caching

The `ChairmanPreferenceStore` uses a 2-query batch pattern rather than per-key queries:

```
getPreferences({ chairmanId, ventureId, keys: ['a', 'b', 'c'] })
    |
    +-> Query 1: SELECT * FROM chairman_preferences
    |   WHERE chairman_id = $1 AND venture_id = $2
    |   AND preference_key IN ('a', 'b', 'c')
    |   Result: venture-specific matches
    |
    +-> Query 2: SELECT * FROM chairman_preferences
    |   WHERE chairman_id = $1 AND venture_id IS NULL
    |   AND preference_key IN ('a', 'b', 'c')
    |   Result: global fallbacks
    |
    +-> In-memory merge: venture-specific wins over global
    +-> Apply system defaults for any remaining unresolved keys
```

This pattern keeps preference resolution to exactly 2 queries regardless of how many keys are requested.

## Bottleneck Analysis

### Primary Bottleneck: LLM API Latency

```
+------------------------------------------------------------------+
|              Typical Stage Execution Time Breakdown                |
+------------------------------------------------------------------+
|                                                                    |
|  LLM API Call        |████████████████████████████████|   85-95%  |
|  Database Operations |██|                                3-8%     |
|  Gate Evaluation     |█|                                 1-3%     |
|  Template Loading    |▌|                                 < 1%     |
|  Event Processing    |▌|                                 < 1%     |
|                                                                    |
|  Total: 3-30 seconds (dominated by LLM latency)                  |
+------------------------------------------------------------------+
```

**LLM latency is not under our control.** The orchestrator's performance optimization focuses on everything else: database operations, gate evaluation, template loading, and event processing. These non-LLM operations stay well within the 10-second budget.

### Secondary Bottleneck: Database Round-Trips

Each stage execution requires multiple database round-trips:

```
Round-Trip Count per Stage:

    Minimum (no gates, no decisions):
        1. Load venture
        2. Load stage config
        3. Load artifacts
        4. Insert artifact(s)
        5. Insert transition
        6. Insert event(s)
        7. Update venture stage
        = 7 round-trips (~35ms)

    Maximum (gates + decisions + audit):
        7 base round-trips
        + 2 preference queries
        + 1 gate artifact quality query
        + 1 decision insert
        + 1 chairman decision insert
        + 1 audit log insert
        = 13 round-trips (~65ms)
```

**Mitigation:** Database operations are inherently sequential (insert depends on previous state), but the low per-query latency (< 10ms each) keeps total round-trip time under 100ms.

### Idempotency as Performance Feature

The `idempotency_key` on `venture_stage_transitions` prevents unnecessary retries from creating duplicate state:

```
Without idempotency:
    Retry after timeout -> duplicate transition -> corrupted state
    Recovery: manual cleanup, state reconciliation

With idempotency:
    Retry after timeout -> unique constraint violation -> detect duplicate
    Recovery: automatic (operation already completed)
```

This turns a potential data corruption scenario into a safe, automatic recovery, avoiding expensive manual intervention.

## Monitoring Recommendations

### Query Performance Monitoring

**Tool:** `pg_stat_statements` extension

```sql
-- Enable the extension (one-time)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries (> 50ms average)
SELECT
    query,
    calls,
    mean_exec_time,
    max_exec_time,
    rows
FROM pg_stat_statements
WHERE mean_exec_time > 50
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**Alert Threshold:** Any query averaging > 50ms warrants investigation via `EXPLAIN ANALYZE`.

### Token Usage Tracking

Token consumption per stage is tracked via the LLM client's response metadata:

| Metric | Source | Storage |
|--------|--------|---------|
| Prompt tokens | LLM response.usage.input_tokens | Stage artifact metadata |
| Completion tokens | LLM response.usage.output_tokens | Stage artifact metadata |
| Total tokens | Sum of above | Eva audit log |
| Budget remaining | Profile budget - cumulative usage | Computed at query time |

**Monitoring Query:**

```sql
-- Token usage per venture per stage
SELECT
    v.venture_code,
    va.lifecycle_stage,
    va.content->'metadata'->>'prompt_tokens' as prompt_tokens,
    va.content->'metadata'->>'completion_tokens' as completion_tokens
FROM venture_artifacts va
JOIN ventures v ON v.id = va.venture_id
WHERE va.is_current = true
ORDER BY v.venture_code, va.lifecycle_stage;
```

### Event Queue Health

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Unprocessed events | < 100 | 100-1,000 | > 1,000 |
| Total events | < 100,000 | 100,000-500,000 | > 500,000 |
| Processing lag | < 1 minute | 1-10 minutes | > 10 minutes |

**Monitoring Query:**

```sql
-- Event queue health
SELECT
    COUNT(*) FILTER (WHERE NOT processed) as unprocessed,
    COUNT(*) as total,
    MAX(CASE WHEN NOT processed THEN created_at END) as oldest_unprocessed,
    NOW() - MAX(CASE WHEN NOT processed THEN created_at END) as processing_lag
FROM eva_events;
```

### Table Bloat Monitoring

Tables with frequent updates (ventures, venture_artifacts) may accumulate dead tuples:

| Table | Update Frequency | Bloat Risk | Mitigation |
|-------|-----------------|------------|------------|
| ventures | Every stage transition | Medium | Autovacuum (default settings) |
| venture_artifacts | Version updates (is_current toggle) | Medium | Autovacuum + periodic VACUUM ANALYZE |
| eva_events | processed flag toggle | High | Archive + purge old records |
| eva_audit_log | Append-only | Low | Partition by month if > 1M rows |

### Dashboard Metrics

Recommended metrics for operational monitoring:

```
+------------------------------------------------------------------+
|                    Operational Dashboard                           |
+------------------------------------------------------------------+
|                                                                    |
|  Stage Processing                                                  |
|  ├── Stages processed / hour                                      |
|  ├── Average stage duration (ms)                                   |
|  ├── Success rate (COMPLETED / total)                              |
|  ├── Block rate (BLOCKED / total)                                  |
|  └── Failure rate (FAILED / total)                                |
|                                                                    |
|  Database Health                                                   |
|  ├── Query latency p50 / p95 / p99                                |
|  ├── Connection pool utilization                                   |
|  ├── Dead tuple count per table                                   |
|  └── Index hit ratio (should be > 99%)                            |
|                                                                    |
|  LLM Performance                                                   |
|  ├── Token consumption rate                                        |
|  ├── LLM API latency p50 / p95                                    |
|  ├── LLM error rate                                                |
|  └── Budget utilization per venture                                |
|                                                                    |
|  Event Processing                                                  |
|  ├── Events created / hour                                         |
|  ├── Events processed / hour                                      |
|  ├── Queue depth (unprocessed count)                               |
|  └── Processing lag (time)                                         |
|                                                                    |
+------------------------------------------------------------------+
```

## Capacity Planning

### Growth Projections

| Timeframe | Ventures | Artifacts | Transitions | Events | Audit Log |
|-----------|----------|-----------|-------------|--------|-----------|
| Current | 50 | 2,500 | 500 | 5,000 | 10,000 |
| 6 months | 300 | 15,000 | 3,000 | 30,000 | 60,000 |
| 1 year | 1,000 | 50,000 | 10,000 | 100,000 | 200,000 |
| 2 years | 3,000 | 150,000 | 30,000 | 300,000 | 600,000 |

### When to Consider Optimization

| Trigger | Optimization | Priority |
|---------|-------------|----------|
| Query latency > 50ms consistently | Add composite indexes, review EXPLAIN plans | High |
| eva_events > 100K rows | Implement archive/purge strategy | Medium |
| eva_audit_log > 1M rows | Partition by month | Medium |
| Stage execution > 10s (excluding LLM) | Profile and optimize DB round-trips | High |
| Connection pool > 80% utilization | Increase pool size or optimize connection reuse | High |
| Index hit ratio < 99% | Review index strategy, add missing indexes | Medium |

All current indexes and query patterns are designed for the 1-year projection (1,000 ventures). Beyond that scale, review this document and run benchmarks against actual data volumes.
