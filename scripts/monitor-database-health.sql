-- WEEKLY DATABASE HEALTH MONITORING
-- Run this script weekly to catch issues early
-- Generated: 2025-12-23

-- ==============================================================================
-- 1. DISK USAGE OVERVIEW
-- ==============================================================================

SELECT
  'Database Size' as metric,
  pg_size_pretty(pg_database_size(current_database())) as value,
  'Target: <500 MB' as target;

-- ==============================================================================
-- 2. TOP 10 LARGEST TABLES
-- ==============================================================================

SELECT
  schemaname,
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||relname)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname) - pg_relation_size(schemaname||'.'||relname)) as indexes_size,
  n_live_tup as row_count,
  CASE
    WHEN pg_total_relation_size(schemaname||'.'||relname) = 0 THEN 0
    ELSE round((pg_total_relation_size(schemaname||'.'||relname) - pg_relation_size(schemaname||'.'||relname))::numeric /
               pg_total_relation_size(schemaname||'.'||relname) * 100, 1)
  END as index_ratio_pct
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC
LIMIT 10;

-- ==============================================================================
-- 3. TABLE BLOAT (Dead Tuples)
-- ==============================================================================

SELECT
  schemaname,
  relname as table_name,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as table_size,
  last_vacuum,
  last_autovacuum,
  CASE
    WHEN n_dead_tup::numeric / NULLIF(n_live_tup, 0) > 0.2 THEN 'VACUUM NEEDED'
    WHEN n_dead_tup::numeric / NULLIF(n_live_tup, 0) > 0.1 THEN 'MONITOR'
    ELSE 'OK'
  END as status
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC
LIMIT 10;

-- ==============================================================================
-- 4. UNUSED OR UNDERUTILIZED INDEXES
-- ==============================================================================

SELECT
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  CASE
    WHEN idx_scan = 0 THEN 'NEVER USED - Consider dropping'
    WHEN idx_scan < 10 THEN 'RARELY USED - Investigate'
    ELSE 'OK'
  END as recommendation
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan < 100
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 15;

-- ==============================================================================
-- 5. CACHE HIT RATIO (Target: >95%)
-- ==============================================================================

SELECT
  'Cache Hit Ratio' as metric,
  round(sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2) || '%' as value,
  CASE
    WHEN sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) >= 0.98 THEN 'EXCELLENT'
    WHEN sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) >= 0.95 THEN 'GOOD'
    WHEN sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) >= 0.90 THEN 'ACCEPTABLE'
    ELSE 'POOR - Investigate'
  END as status
FROM pg_statio_user_tables;

-- ==============================================================================
-- 6. ACTIVE CONNECTIONS
-- ==============================================================================

SELECT
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity;

-- ==============================================================================
-- 7. LONG-RUNNING QUERIES (>30 seconds)
-- ==============================================================================

SELECT
  pid,
  usename,
  application_name,
  state,
  EXTRACT(EPOCH FROM (now() - query_start))::integer as runtime_seconds,
  left(query, 100) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
  AND (now() - query_start) > interval '30 seconds'
ORDER BY query_start;

-- ==============================================================================
-- 8. TOP 10 SLOWEST QUERIES (by average time)
-- ==============================================================================

SELECT
  calls,
  mean_exec_time::numeric(10,2) as avg_ms,
  total_exec_time::numeric(10,2) as total_ms,
  shared_blks_read as disk_reads,
  shared_blks_hit as cache_hits,
  left(query, 100) as query_preview
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND calls > 10
ORDER BY mean_exec_time DESC
LIMIT 10;

-- ==============================================================================
-- 9. TOP 10 MOST DISK-INTENSIVE QUERIES
-- ==============================================================================

SELECT
  calls,
  shared_blks_read as disk_blocks_read,
  round(shared_blks_read::numeric / calls, 2) as avg_blocks_per_call,
  total_exec_time::numeric(10,2) as total_ms,
  left(query, 100) as query_preview
FROM pg_stat_statements
WHERE shared_blks_read > 0
  AND query NOT LIKE '%pg_stat_statements%'
ORDER BY shared_blks_read DESC
LIMIT 10;

-- ==============================================================================
-- 10. AUTOVACUUM ACTIVITY
-- ==============================================================================

SELECT
  relname as table_name,
  last_vacuum,
  last_autovacuum,
  vacuum_count,
  autovacuum_count,
  CASE
    WHEN last_autovacuum IS NULL THEN 'NEVER AUTOVACUUMED'
    WHEN last_autovacuum < now() - interval '7 days' THEN 'STALE (>7 days)'
    ELSE 'OK'
  END as status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 100
ORDER BY last_autovacuum NULLS FIRST
LIMIT 10;

-- ==============================================================================
-- 11. SEQUENTIAL SCANS ON LARGE TABLES (Potential Missing Indexes)
-- ==============================================================================

SELECT
  schemaname,
  relname as table_name,
  seq_scan as sequential_scans,
  idx_scan as index_scans,
  n_live_tup as live_rows,
  round(seq_scan::numeric / NULLIF(seq_scan + COALESCE(idx_scan, 0), 0) * 100, 1) as seq_scan_pct,
  CASE
    WHEN seq_scan > idx_scan AND n_live_tup > 1000 THEN 'NEEDS INDEX'
    WHEN seq_scan > 1000 AND n_live_tup > 1000 THEN 'MONITOR'
    ELSE 'OK'
  END as recommendation
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND n_live_tup > 1000
ORDER BY seq_scan DESC
LIMIT 10;

-- ==============================================================================
-- 12. INDEX BLOAT ESTIMATION (Approximate)
-- ==============================================================================

SELECT
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE
    WHEN idx_scan = 0 THEN 'UNUSED'
    WHEN idx_tup_read > idx_tup_fetch * 10 THEN 'POSSIBLE BLOAT'
    ELSE 'OK'
  END as health_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND pg_relation_size(indexrelid) > 1000000  -- >1 MB
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;

-- ==============================================================================
-- 13. TABLES WITH HIGH INSERT/UPDATE/DELETE ACTIVITY
-- ==============================================================================

SELECT
  schemaname,
  relname as table_name,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_tup_ins + n_tup_upd + n_tup_del as total_modifications,
  CASE
    WHEN n_tup_upd + n_tup_del = 0 THEN 'APPEND-ONLY'
    WHEN n_tup_upd + n_tup_del > n_tup_ins THEN 'HIGH CHURN'
    ELSE 'NORMAL'
  END as access_pattern
FROM pg_stat_user_tables
WHERE n_tup_ins + n_tup_upd + n_tup_del > 100
ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC
LIMIT 10;

-- ==============================================================================
-- 14. HEALTH SUMMARY
-- ==============================================================================

WITH metrics AS (
  SELECT
    (SELECT pg_database_size(current_database())) / 1024 / 1024 as db_size_mb,
    (SELECT sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)
     FROM pg_statio_user_tables) as cache_ratio,
    (SELECT count(*) FROM pg_stat_user_indexes WHERE idx_scan = 0 AND schemaname = 'public') as unused_indexes,
    (SELECT count(*) FROM pg_stat_user_tables WHERE n_dead_tup::numeric / NULLIF(n_live_tup, 0) > 0.2) as bloated_tables
)
SELECT
  '🗄️  Database Size: ' || round(db_size_mb::numeric, 0) || ' MB' as metric_1,
  '📈 Cache Hit Ratio: ' || round(cache_ratio * 100, 2) || '%' as metric_2,
  '📇 Unused Indexes: ' || unused_indexes as metric_3,
  '🗑️  Bloated Tables (>20% dead): ' || bloated_tables as metric_4,
  CASE
    WHEN db_size_mb < 500 AND cache_ratio > 0.95 AND unused_indexes < 5 AND bloated_tables = 0
    THEN '✅ EXCELLENT HEALTH'
    WHEN db_size_mb < 700 AND cache_ratio > 0.90 AND unused_indexes < 10 AND bloated_tables < 3
    THEN '⚠️  ACCEPTABLE - Monitor'
    ELSE '❌ NEEDS ATTENTION'
  END as overall_status
FROM metrics;

-- ==============================================================================
-- MAINTENANCE ACTIONS CHECKLIST
-- ==============================================================================

-- Based on the above results, take action if:
-- ✅ Dead tuple ratio >20%: Run VACUUM ANALYZE
-- ✅ Unused indexes detected: Investigate and drop if confirmed
-- ✅ Cache hit ratio <95%: Check for missing indexes or increase shared_buffers
-- ✅ Large tables with high seq_scan: Add appropriate indexes
-- ✅ Index size >10x table size: Consider REINDEX
-- ✅ Long-running queries (>30s): Optimize queries or add indexes
