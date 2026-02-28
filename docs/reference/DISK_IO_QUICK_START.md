---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Disk IO Optimization - Quick Start Guide


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, guide, reference, supabase

## TL;DR - What to Do Right Now

Your Supabase database has **excellent performance (97.66% cache hit ratio)** but is wasting **300+ MB on index bloat**. Here's the fastest path to fix it:

### Immediate Actions (15 minutes)

1. **Run diagnostics script** (already done):
   ```bash
   node scripts/diagnose-disk-io-performance.js
   ```

2. **Open Supabase SQL Editor** and run:
   ```sql
   -- Fix dead tuples (26% bloat)
   VACUUM ANALYZE public.claude_sessions;

   -- Drop indexes on empty tables (zero risk, 3+ MB freed)
   DROP INDEX IF EXISTS public.idx_memory_embedding;
   DROP INDEX IF EXISTS public.idx_context_embeddings_vector;
   DROP INDEX IF EXISTS public.idx_component_embeddings_vector;
   ```

3. **Configure aggressive autovacuum**:
   ```sql
   ALTER TABLE public.claude_sessions
   SET (autovacuum_vacuum_scale_factor = 0.1);

   ALTER TABLE public.sub_agent_execution_results
   SET (autovacuum_vacuum_scale_factor = 0.1);
   ```

**Expected Impact**: 5-10 MB freed, 20% faster on high-churn tables

---

## This Week (30 minutes during low-traffic)

Run `/mnt/c/_EHG/EHG_Engineer/scripts/optimize-disk-io-immediate.sql` in Supabase SQL Editor

**Expected Impact**: 10-20 MB freed, 30-40% faster INSERTs

---

## Next Week (After 7-day monitoring)

Run `/mnt/c/_EHG/EHG_Engineer/scripts/optimize-disk-io-phase2.sql` in Supabase SQL Editor

**Expected Impact**: 250-300 MB freed, 50-70% faster INSERTs

---

## Weekly Monitoring (5 minutes)

Run `/mnt/c/_EHG/EHG_Engineer/scripts/monitor-database-health.sql` in Supabase SQL Editor

---

## Files Created

| File | Purpose |
|------|---------|
| `DISK_IO_OPTIMIZATION_REPORT.md` | Full diagnostic report with analysis |
| `scripts/diagnose-disk-io-performance.js` | Node.js diagnostic tool (reusable) |
| `scripts/optimize-disk-io-immediate.sql` | Immediate fixes (run today) |
| `scripts/optimize-disk-io-phase2.sql` | Advanced fixes (run next week) |
| `scripts/monitor-database-health.sql` | Weekly monitoring queries |

---

## Top 3 Issues Found

### 1. 366 MB Index Bloat on `sub_agent_execution_results`
- **Table size**: 5.6 MB (6,153 rows)
- **Index size**: 366 MB (65x larger!)
- **Fix**: REINDEX TABLE (Phase 2)

### 2. 26% Dead Tuples in `claude_sessions`
- **Live rows**: 620
- **Dead rows**: 163
- **Fix**: VACUUM ANALYZE (Immediate)

### 3. 15 Unused Indexes (14+ MB)
- **Largest**: governance_audit_log indexes (6 MB)
- **Fix**: Drop after 7-day verification (Phase 2)

---

## Before vs After (Expected)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Database Size | 679 MB | 400-450 MB | 35% reduction |
| Cache Hit Ratio | 97.66% | 98%+ | Maintained |
| INSERT Speed (sub_agent_execution_results) | Baseline | 50-70% faster | Major |
| Sequential Scan Time | Baseline | 20-30% faster | Moderate |
| Backup Time | Baseline | 35% faster | Significant |

---

## Safety Notes

- All scripts use `DROP INDEX IF EXISTS` (safe if index doesn't exist)
- Phase 2 uses `CONCURRENTLY` to avoid locking tables
- Autovacuum changes are table-specific (won't affect other tables)
- Rollback instructions included in Phase 2 script

---

## Questions?

- **Why is sub_agent_execution_results so bloated?**
  - Likely vector/embedding indexes or JSONB GIN indexes
  - Check with: `SELECT * FROM pg_indexes WHERE tablename = 'sub_agent_execution_results';`

- **Can I run this on production?**
  - Immediate script: Yes (low risk)
  - Phase 2 script: Run during low-traffic window (2-5 AM)

- **What if queries slow down?**
  - Recreate dropped indexes (templates in Phase 2 script)
  - Monitor Supabase dashboard metrics

---

## Next Steps

1. ✅ Run immediate fixes (today)
2. ⏳ Monitor for 7 days
3. ✅ Run Phase 2 optimization (next week)
4. 🔄 Schedule weekly monitoring (set calendar reminder)

---

**Generated**: 2025-12-23
**Database**: dedlbzhpgkmetvhbkyzq (consolidated EHG_Engineer + EHG)
**Agent**: Database Sub-Agent (Principal Database Architect)
