---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Supabase Disk IO Optimization Report


## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Critical Issues (High Impact)](#critical-issues-high-impact)
  - [1. Massive Index Overhead on `sub_agent_execution_results`](#1-massive-index-overhead-on-sub_agent_execution_results)
  - [2. Dead Tuples in `claude_sessions` (26% bloat)](#2-dead-tuples-in-claude_sessions-26-bloat)
  - [3. Unused Indexes Consuming 14+ MB](#3-unused-indexes-consuming-14-mb)
- [Medium Priority Issues](#medium-priority-issues)
  - [4. Sequential Scans on Small Tables](#4-sequential-scans-on-small-tables)
  - [5. High Disk Reads on INSERT Operations](#5-high-disk-reads-on-insert-operations)
- [Low Priority Issues](#low-priority-issues)
  - [6. WAL Replication Query (2056s runtime)](#6-wal-replication-query-2056s-runtime)
  - [7. Autovacuum Configuration](#7-autovacuum-configuration)
- [Implementation Roadmap](#implementation-roadmap)
  - [Phase 1: Immediate (Today)](#phase-1-immediate-today)
  - [Phase 2: This Week](#phase-2-this-week)
  - [Phase 3: Ongoing Monitoring](#phase-3-ongoing-monitoring)
- [SQL Scripts](#sql-scripts)
  - [Monitoring Script (Run Weekly)](#monitoring-script-run-weekly)
  - [Maintenance Script (Run Monthly)](#maintenance-script-run-monthly)
- [Performance Metrics (Before Optimization)](#performance-metrics-before-optimization)
- [Expected Metrics (After Optimization)](#expected-metrics-after-optimization)
- [Monitoring Commands](#monitoring-commands)
- [Questions for Further Investigation](#questions-for-further-investigation)
- [Conclusion](#conclusion)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, unit, schema, feature

**Generated**: 2025-12-23
**Database**: dedlbzhpgkmetvhbkyzq (consolidated EHG_Engineer + EHG)
**Total Size**: 679 MB

---

## Executive Summary

Overall database health is **GOOD** with excellent cache performance (97.66%). However, there are several optimization opportunities that will reduce disk IO:

1. **372 MB of unnecessary index overhead** on `sub_agent_execution_results`
2. **26% dead tuples** in `claude_sessions` table requiring VACUUM
3. **15 unused indexes** consuming 14+ MB and causing write overhead
4. Several tables with 100% sequential scan ratios (small tables, acceptable)

---

## Critical Issues (High Impact)

### 1. Massive Index Overhead on `sub_agent_execution_results`
**Impact**: Very High - Wasting disk IO on writes

- **Table size**: 5.6 MB (6,153 rows)
- **Index size**: 366 MB (65x larger than table!)
- **Problem**: Indexes are bloated or unnecessary

**Root Cause Analysis**:
This table has the most INSERT operations (1,529 disk blocks read during INSERTs). The massive index overhead suggests:
- Vector/embedding indexes that are oversized
- Possible index bloat from frequent INSERT/DELETE cycles
- GIN/GiST indexes on JSONB columns without proper maintenance

**Recommendations**:
```sql
-- 1. Check which indexes exist
SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE relname = 'sub_agent_execution_results'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 2. Rebuild bloated indexes (run one at a time during low-traffic window)
REINDEX TABLE sub_agent_execution_results;

-- 3. Consider dropping unused indexes (check usage first)
-- Only drop if idx_scan = 0 in pg_stat_user_indexes
```

**Expected Impact**:
- Reduce table total size from 372 MB to ~50-100 MB
- Reduce INSERT time by 50-70%
- Reduce disk IO by ~300 MB

---

### 2. Dead Tuples in `claude_sessions` (26% bloat)
**Impact**: Medium - Causing unnecessary table scans

- **Live rows**: 620
- **Dead rows**: 163 (26.29%)
- **Last autovacuum**: 2025-12-22 21:23:29 (recent, but not aggressive enough)

**Problem**: High UPDATE/DELETE activity without sufficient VACUUM

**Recommendations**:
```sql
-- Immediate: Manual VACUUM
VACUUM ANALYZE public.claude_sessions;

-- Long-term: Adjust autovacuum settings for this table
ALTER TABLE public.claude_sessions
SET (autovacuum_vacuum_scale_factor = 0.1);  -- Default is 0.2 (20%)

-- If session data is append-only, consider partitioning by created_at
```

**Expected Impact**:
- Reduce sequential scan time by 20-30%
- Free up dead row storage

---

### 3. Unused Indexes Consuming 14+ MB
**Impact**: Medium - Write overhead on every INSERT/UPDATE

The following indexes have **ZERO scans** and should be evaluated for removal:

| Index | Table | Size | Recommendation |
|-------|-------|------|----------------|
| `idx_audit_record` | governance_audit_log | 2216 kB | **DROP** - audit logs use time-based queries |
| `governance_audit_log_pkey` | governance_audit_log | 2072 kB | **KEEP** - Primary key (but investigate why unused) |
| `idx_audit_timestamp` | governance_audit_log | 1760 kB | **INVESTIGATE** - Should be used for time queries |
| `idx_memory_embedding` | agent_memory_stores | 1608 kB | **DROP** - Vector index on empty table (0 rows) |
| `idx_strategic_directives_v2_embedding` | strategic_directives_v2 | 1528 kB | **INVESTIGATE** - Vector search not enabled? |
| `idx_retrospectives_content_embedding_ivfflat` | retrospectives | 1432 kB | **INVESTIGATE** - IVFFlat index unused |
| `idx_sd_phase_handoffs_validation_details` | sd_phase_handoffs | 1336 kB | **DROP** - GIN index on JSONB not queried |
| `idx_context_embeddings_vector` | context_embeddings | 968 kB | **DROP** - Unused vector index |

**Action Plan**:
```sql
-- Step 1: Confirm zero usage over 7 days
SELECT
  schemaname, relname, indexrelname, idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Step 2: Drop indexes with zero scans (example)
-- IMPORTANT: Test in non-production first!
DROP INDEX IF EXISTS public.idx_memory_embedding;  -- Empty table
DROP INDEX IF EXISTS public.idx_context_embeddings_vector;  -- Unused
DROP INDEX IF EXISTS public.idx_sd_phase_handoffs_validation_details;  -- JSONB not queried

-- Step 3: Monitor for performance impact
-- If queries slow down, recreate index
```

**Expected Impact**:
- Reduce INSERT/UPDATE overhead by 10-15%
- Free up 10-14 MB disk space
- Reduce backup/restore time

---

## Medium Priority Issues

### 4. Sequential Scans on Small Tables
**Impact**: Low - Tables are small, acceptable

These tables show 100% sequential scans but have <100 rows:
- `system_health` (1 row, 100% seq scans)
- `governance_proposals` (0 rows, 100% seq scans)
- `sd_backlog_map` (0 rows, 100% seq scans)
- `documentation_violations` (0 rows, 100% seq scans)

**Recommendation**: **No action needed**. Sequential scans on tiny tables (<1000 rows) are faster than index scans due to index overhead.

---

### 5. High Disk Reads on INSERT Operations
**Impact**: Medium - Caused by index overhead

**Top IO-intensive operations**:
1. `sub_agent_execution_results` INSERTs: 1,529 disk blocks (4.56 avg/call)
2. Schema introspection queries: 1,065 disk blocks (15 avg/call)
3. `strategic_directives_v2` DELETEs: 479 disk blocks (0.05 avg/call)

**Recommendations**:
- Address `sub_agent_execution_results` index bloat (see Issue #1)
- Schema introspection is Supabase internal - cannot optimize
- DELETE operations are acceptable (minimal IO per call)

---

## Low Priority Issues

### 6. WAL Replication Query (2056s runtime)
**Impact**: None - Expected behavior

Long-running query detected:
```
START_REPLICATION SLOT supabase_realtime_messages_replication_slot_v2_69_0
```

**This is NORMAL** - Supabase Realtime uses streaming replication. Not a performance issue.

---

### 7. Autovacuum Configuration
**Current settings**: Using Supabase defaults (estimated)

**Recommendations**:
```sql
-- Check current autovacuum settings
SHOW autovacuum;
SHOW autovacuum_vacuum_scale_factor;
SHOW autovacuum_analyze_scale_factor;

-- For high-churn tables, make autovacuum more aggressive
ALTER TABLE public.claude_sessions
SET (
  autovacuum_vacuum_scale_factor = 0.1,  -- Vacuum at 10% dead (vs 20% default)
  autovacuum_analyze_scale_factor = 0.05  -- Analyze at 5% changed
);

ALTER TABLE public.sub_agent_execution_results
SET (
  autovacuum_vacuum_scale_factor = 0.1
);
```

---

## Implementation Roadmap

### Phase 1: Immediate (Today)
1. Run `VACUUM ANALYZE public.claude_sessions;`
2. Identify bloated indexes on `sub_agent_execution_results`
3. Drop indexes on empty tables (`agent_memory_stores`, etc.)

### Phase 2: This Week
1. `REINDEX TABLE sub_agent_execution_results;` during low-traffic window
2. Drop confirmed unused indexes (after 7-day monitoring)
3. Configure aggressive autovacuum for high-churn tables

### Phase 3: Ongoing Monitoring
1. Set up weekly `VACUUM ANALYZE` jobs for large tables
2. Monitor `pg_stat_user_indexes` for new unused indexes
3. Track table bloat with `pg_stat_user_tables.n_dead_tup`

---

## SQL Scripts

### Monitoring Script (Run Weekly)
```sql
-- Check for tables needing VACUUM
SELECT
  schemaname, relname,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC;

-- Check for unused indexes
SELECT
  schemaname, relname, indexrelname,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan < 10
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Maintenance Script (Run Monthly)
```sql
-- VACUUM ANALYZE all large tables
VACUUM ANALYZE public.sub_agent_execution_results;
VACUUM ANALYZE public.governance_audit_log;
VACUUM ANALYZE public.ai_quality_assessments;
VACUUM ANALYZE public.claude_sessions;

-- Rebuild specific bloated indexes (if identified)
-- REINDEX INDEX idx_sub_agent_results_created_at;
```

---

## Performance Metrics (Before Optimization)

- **Database Size**: 679 MB
- **Cache Hit Ratio**: 97.66% (Excellent)
- **Largest Table**: `sub_agent_execution_results` (372 MB, 98% indexes)
- **Dead Tuple Ratio**: 26% in `claude_sessions`
- **Unused Indexes**: 15 indexes, 14+ MB total

## Expected Metrics (After Optimization)

- **Database Size**: ~400-450 MB (35% reduction)
- **Cache Hit Ratio**: 98%+ (maintained/improved)
- **INSERT Performance**: 50-70% faster on `sub_agent_execution_results`
- **Sequential Scan Time**: 20-30% faster on vacuumed tables
- **Backup Size**: 200+ MB reduction

---

## Monitoring Commands

```bash
# Run diagnostics (current script)
node scripts/diagnose-disk-io-performance.js

# Monitor autovacuum activity (Supabase SQL Editor)
SELECT * FROM pg_stat_progress_vacuum;

# Check index bloat
SELECT
  schemaname, tablename, indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  idx_scan
FROM pg_stat_user_indexes
WHERE relname = 'sub_agent_execution_results';
```

---

## Questions for Further Investigation

1. **Why are vector embedding indexes unused?**
   - Are vector search features disabled?
   - Should we drop all embedding indexes if not using vector search?

2. **Why is `governance_audit_log` primary key unused?**
   - Are queries bypassing the PK?
   - Using different column for lookups?

3. **What is the INSERT frequency for `sub_agent_execution_results`?**
   - If append-only, consider partitioning by date
   - If high churn, optimize autovacuum settings

4. **Are JSONB columns in `sd_phase_handoffs` actually queried?**
   - If yes, why is GIN index unused?
   - If no, drop the 1.3 MB index

---

## Conclusion

The database is in good health overall, but **366 MB of index bloat** on a single table is the primary cause of disk IO issues. Addressing this through index maintenance and dropping unused indexes will:

- **Free up 300+ MB** of disk space
- **Reduce write IO by 50-70%** on high-churn tables
- **Improve backup/restore times** significantly
- **Prevent future IO exhaustion** under load

**Recommended First Steps**:
1. Run the immediate VACUUM on `claude_sessions`
2. Investigate `sub_agent_execution_results` index structure
3. Drop indexes on empty tables (zero risk)
4. Monitor for 7 days, then proceed with REINDEX

---

**Report Generated By**: Database Agent Sub-Agent (Principal Database Architect)
**Diagnostic Script**: `/mnt/c/_EHG/EHG_Engineer/scripts/diagnose-disk-io-performance.js`
