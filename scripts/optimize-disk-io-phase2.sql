-- PHASE 2 DISK IO OPTIMIZATION (Run After Phase 1 + 7 Days Monitoring)
-- Run these in Supabase SQL Editor during maintenance window
-- Generated: 2025-12-23

-- ==============================================================================
-- PREREQUISITE: Verify Indexes Are Still Unused After 7 Days
-- ==============================================================================

-- Check if these indexes have been used in the past 7 days
SELECT
  schemaname, relname, indexrelname,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE
    WHEN idx_scan = 0 THEN 'SAFE TO DROP'
    WHEN idx_scan < 10 THEN 'RARELY USED'
    ELSE 'IN USE'
  END as recommendation
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_audit_record',
  'idx_audit_timestamp',
  'idx_audit_table',
  'idx_audit_user',
  'idx_sub_agent_results_created_at',
  'idx_retrospectives_content_embedding_ivfflat',
  'idx_strategic_directives_v2_embedding',
  'idx_leo_sub_agents_embedding'
)
ORDER BY pg_relation_size(indexrelid) DESC;

-- ==============================================================================
-- STEP 1: REINDEX sub_agent_execution_results (If Bloat Confirmed)
-- ==============================================================================

-- IMPORTANT: This will lock the table during reindex
-- Run during low-traffic window (2-5 AM)
-- Expected duration: 30-60 seconds for 6k rows

-- Option A: Reindex entire table (safer, recreates all indexes)
REINDEX TABLE CONCURRENTLY public.sub_agent_execution_results;

-- Option B: Reindex specific bloated index (if identified)
-- REINDEX INDEX CONCURRENTLY public.idx_sub_agent_results_created_at;

-- Verify improvement
SELECT
  relname as table_name,
  pg_size_pretty(pg_relation_size(relid)) as table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as indexes_size,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE relname = 'sub_agent_execution_results';

-- ==============================================================================
-- STEP 2: Drop Confirmed Unused Indexes (After 7-Day Verification)
-- ==============================================================================

-- governance_audit_log indexes (if still unused)
-- WARNING: Keep idx_audit_timestamp if time-based queries are planned
DROP INDEX CONCURRENTLY IF EXISTS public.idx_audit_record;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_audit_table;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_audit_user;
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_audit_timestamp;  -- KEEP if time queries

-- Vector embedding indexes (if not using vector search)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_retrospectives_content_embedding_ivfflat;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_strategic_directives_v2_embedding;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_leo_sub_agents_embedding;

-- Time-based index on sub_agent_execution_results (if still unused)
-- WARNING: Only drop if queries don't filter by created_at
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_sub_agent_results_created_at;

-- Verify they're dropped
SELECT count(*) as remaining_unused_indexes
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public';

-- ==============================================================================
-- STEP 3: VACUUM ANALYZE All Large Tables
-- ==============================================================================

-- Run VACUUM ANALYZE on all tables >10 MB
VACUUM ANALYZE public.sub_agent_execution_results;
VACUUM ANALYZE public.governance_audit_log;
VACUUM ANALYZE public.ai_quality_assessments;
VACUUM ANALYZE public.agent_artifacts;
VACUUM ANALYZE public.agent_task_contracts;

-- Check dead tuple counts
SELECT
  schemaname, relname,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 10;

-- ==============================================================================
-- STEP 4: Optimize governance_audit_log (If Append-Only)
-- ==============================================================================

-- If governance_audit_log is append-only (no UPDATEs/DELETEs), consider:
-- 1. Partitioning by month/quarter
-- 2. Using timescaledb (if Supabase supports)
-- 3. Archiving old records

-- Check UPDATE/DELETE activity
SELECT
  relname,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  CASE
    WHEN n_tup_upd + n_tup_del = 0 THEN 'APPEND-ONLY'
    ELSE 'HIGH CHURN'
  END as access_pattern
FROM pg_stat_user_tables
WHERE relname = 'governance_audit_log';

-- If APPEND-ONLY, create time-based partitions (example)
-- (Requires manual setup - consult Supabase docs)

-- ==============================================================================
-- STEP 5: Reset pg_stat_statements (Optional - After Optimization)
-- ==============================================================================

-- Reset query statistics to measure improvement
-- WARNING: This clears all historical query stats
-- SELECT pg_stat_statements_reset();

-- ==============================================================================
-- VERIFICATION QUERIES (Run 24 Hours After Optimization)
-- ==============================================================================

-- 1. Check database size reduction
SELECT
  pg_size_pretty(pg_database_size(current_database())) as current_size,
  '679 MB' as before_size,
  'Expected: 400-450 MB' as target_size;

-- 2. Check cache hit ratio improvement
SELECT
  sum(heap_blks_hit)::float / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 as cache_hit_ratio,
  'Target: 98%+' as target
FROM pg_statio_user_tables;

-- 3. Check if sub_agent_execution_results INSERTs are faster
SELECT
  query,
  calls,
  mean_exec_time::numeric(10,2) as avg_time_ms,
  shared_blks_read as disk_reads
FROM pg_stat_statements
WHERE query LIKE '%INSERT INTO "public"."sub_agent_execution_results"%'
ORDER BY calls DESC
LIMIT 1;

-- 4. Check table bloat status
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 100
ORDER BY dead_pct DESC
LIMIT 10;

-- 5. Check remaining unused indexes
SELECT count(*) as unused_indexes
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public';

-- ==============================================================================
-- ROLLBACK PLAN (If Issues Arise)
-- ==============================================================================

-- If queries slow down after dropping indexes, recreate them:

-- Recreate governance_audit_log indexes (examples)
-- CREATE INDEX idx_audit_record ON public.governance_audit_log(record_id);
-- CREATE INDEX idx_audit_timestamp ON public.governance_audit_log(timestamp);

-- Recreate vector embedding indexes (if needed)
-- CREATE INDEX idx_strategic_directives_v2_embedding
--   ON public.strategic_directives_v2
--   USING ivfflat (embedding vector_cosine_ops);

-- ==============================================================================
-- NOTES
-- ==============================================================================

-- 1. Use CONCURRENTLY to avoid table locks (slower but safer)
-- 2. Monitor Supabase dashboard for query performance after changes
-- 3. Expected total improvement: 250-300 MB freed, 50-70% faster INSERTs
-- 4. Schedule monthly VACUUM ANALYZE for maintenance
-- 5. Consider enabling auto_explain to log slow queries:
--    ALTER DATABASE postgres SET auto_explain.log_min_duration = 1000;  -- 1s
