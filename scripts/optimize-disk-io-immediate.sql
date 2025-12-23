-- IMMEDIATE DISK IO OPTIMIZATION ACTIONS
-- Run these in Supabase SQL Editor during low-traffic window
-- Generated: 2025-12-23

-- ==============================================================================
-- STEP 1: VACUUM High-Bloat Tables
-- ==============================================================================

-- VACUUM claude_sessions (26% dead tuples)
VACUUM ANALYZE public.claude_sessions;

-- Check if it worked
SELECT
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'claude_sessions';

-- ==============================================================================
-- STEP 2: Drop Indexes on Empty Tables (Zero Risk)
-- ==============================================================================

-- agent_memory_stores has 0 rows but 1.6 MB index
DROP INDEX IF EXISTS public.idx_memory_embedding;

-- context_embeddings unused vector index
DROP INDEX IF EXISTS public.idx_context_embeddings_vector;

-- component_registry_embeddings unused vector index
DROP INDEX IF EXISTS public.idx_component_embeddings_vector;

-- Verify they're dropped
SELECT
  schemaname, relname, indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE relname IN ('agent_memory_stores', 'context_embeddings', 'component_registry_embeddings');

-- ==============================================================================
-- STEP 3: Investigate sub_agent_execution_results Index Bloat
-- ==============================================================================

-- Check which indexes exist and their sizes
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE relname = 'sub_agent_execution_results'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Check table vs index size ratio
SELECT
  relname as table_name,
  pg_size_pretty(pg_relation_size(relid)) as table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as indexes_size,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE relname = 'sub_agent_execution_results';

-- ==============================================================================
-- STEP 4: Configure Aggressive Autovacuum for High-Churn Tables
-- ==============================================================================

-- Make autovacuum more aggressive on claude_sessions
ALTER TABLE public.claude_sessions
SET (
  autovacuum_vacuum_scale_factor = 0.1,  -- Vacuum at 10% dead (vs 20% default)
  autovacuum_analyze_scale_factor = 0.05  -- Analyze at 5% changed
);

-- Make autovacuum more aggressive on sub_agent_execution_results
ALTER TABLE public.sub_agent_execution_results
SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- Verify settings
SELECT
  relname,
  reloptions
FROM pg_class
WHERE relname IN ('claude_sessions', 'sub_agent_execution_results');

-- ==============================================================================
-- STEP 5: Drop Unused JSONB Indexes (Low Usage)
-- ==============================================================================

-- sd_phase_handoffs validation_details GIN index (1.3 MB, 0 scans)
-- ONLY drop if you confirm these JSONB columns are NOT queried with @>, ? operators
-- DROP INDEX IF EXISTS public.idx_sd_phase_handoffs_validation_details;

-- ==============================================================================
-- VERIFICATION QUERIES
-- ==============================================================================

-- Check overall database size improvement
SELECT pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Check remaining unused indexes
SELECT
  schemaname, relname, indexrelname,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan < 10
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Check tables still needing VACUUM
SELECT
  schemaname, relname,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC;

-- ==============================================================================
-- NOTES
-- ==============================================================================

-- 1. Run VACUUM during low-traffic window (it locks tables briefly)
-- 2. REINDEX should be run separately if index bloat confirmed (takes longer)
-- 3. Monitor pg_stat_user_indexes for 7 days before dropping more indexes
-- 4. Expected improvement: 10-20 MB freed, 20-30% faster INSERTs
