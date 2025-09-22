-- Production Verification Queries
-- Run these after pilot deployment to verify system health

-- ========================================
-- 1. Story Generation Verification
-- ========================================

-- Check story generation (replace with your SD/PRD IDs)
SELECT * FROM fn_generate_stories_from_prd('SD-2025-PILOT-001', 'PRD-PILOT-001', 'dry_run');

-- After dry run looks good, generate stories:
-- SELECT * FROM fn_generate_stories_from_prd('SD-2025-PILOT-001', 'PRD-PILOT-001', 'upsert');

-- ========================================
-- 2. Story Status Snapshot
-- ========================================

-- View all stories for the pilot SD
SELECT
    story_key,
    status,
    COALESCE(verification_source->>'build_id', 'not_run') as build_id,
    last_verified_at,
    coverage_pct
FROM v_story_verification_status
WHERE sd_key = 'SD-2025-PILOT-001'
ORDER BY sequence_no;

-- ========================================
-- 3. Release Gate Status
-- ========================================

-- Check release gate calculations
SELECT
    sd_key,
    sd_title,
    ready,
    passing_count,
    failing_count,
    not_run_count,
    total_stories,
    passing_pct,
    avg_coverage
FROM v_sd_release_gate
WHERE sd_key = 'SD-2025-PILOT-001';

-- ========================================
-- 4. System Health Checks
-- ========================================

-- Check for duplicate stories (should be 0)
SELECT
    sd_id,
    story_key,
    COUNT(*) as duplicates
FROM sd_backlog_map
WHERE story_key IS NOT NULL
GROUP BY sd_id, story_key
HAVING COUNT(*) > 1;

-- Check for orphaned stories (should be 0)
SELECT COUNT(*) as orphaned_stories
FROM sd_backlog_map sbm
WHERE sbm.story_key IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM strategic_directives_v2 sd
    WHERE sd.id = sbm.sd_id
);

-- Recent webhook activity
SELECT
    story_key,
    verification_status,
    last_verified_at,
    verification_source->>'build_id' as build_id,
    verification_source->>'branch' as branch
FROM sd_backlog_map
WHERE last_verified_at > NOW() - INTERVAL '1 hour'
ORDER BY last_verified_at DESC
LIMIT 10;

-- ========================================
-- 5. Performance Metrics
-- ========================================

-- Story verification latency
SELECT
    AVG(EXTRACT(EPOCH FROM (last_verified_at - created_at))) as avg_latency_seconds,
    MIN(EXTRACT(EPOCH FROM (last_verified_at - created_at))) as min_latency_seconds,
    MAX(EXTRACT(EPOCH FROM (last_verified_at - created_at))) as max_latency_seconds,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (last_verified_at - created_at))) as p95_latency_seconds
FROM sd_backlog_map
WHERE last_verified_at IS NOT NULL
AND created_at IS NOT NULL;

-- Coverage distribution
SELECT
    CASE
        WHEN coverage_pct >= 80 THEN 'High (≥80%)'
        WHEN coverage_pct >= 60 THEN 'Medium (60-79%)'
        WHEN coverage_pct >= 40 THEN 'Low (40-59%)'
        WHEN coverage_pct > 0 THEN 'Very Low (<40%)'
        ELSE 'No Coverage'
    END as coverage_band,
    COUNT(*) as story_count
FROM sd_backlog_map
WHERE story_key IS NOT NULL
GROUP BY coverage_band
ORDER BY
    CASE coverage_band
        WHEN 'High (≥80%)' THEN 1
        WHEN 'Medium (60-79%)' THEN 2
        WHEN 'Low (40-59%)' THEN 3
        WHEN 'Very Low (<40%)' THEN 4
        ELSE 5
    END;

-- ========================================
-- 6. Operational Metrics (for SLOs)
-- ========================================

-- DLQ depth check (if using a DLQ table)
-- SELECT COUNT(*) as dlq_depth FROM story_webhook_dlq WHERE retry_count < max_retries;

-- API error rate (last hour)
-- Requires application logging, placeholder query:
SELECT
    'API Error Rate' as metric,
    'Requires application logs' as value,
    'Target: <2%' as target;

-- Response time check
SELECT
    'P95 Query Time' as metric,
    'Run EXPLAIN ANALYZE on story queries' as action,
    'Target: ≤200ms' as target;

-- ========================================
-- Summary Dashboard Query
-- ========================================

WITH metrics AS (
    SELECT
        COUNT(DISTINCT sd_id) as active_sds,
        COUNT(*) as total_stories,
        COUNT(*) FILTER (WHERE verification_status = 'passing') as passing_stories,
        COUNT(*) FILTER (WHERE verification_status = 'failing') as failing_stories,
        COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '1 hour') as recently_verified,
        AVG(coverage_pct) FILTER (WHERE coverage_pct IS NOT NULL) as avg_coverage
    FROM sd_backlog_map
    WHERE story_key IS NOT NULL
)
SELECT
    'Production Pilot Metrics' as report,
    NOW()::timestamp as generated_at,
    active_sds,
    total_stories,
    passing_stories,
    failing_stories,
    recently_verified,
    ROUND(avg_coverage, 1) as avg_coverage_pct,
    ROUND(100.0 * passing_stories / NULLIF(total_stories, 0), 1) as overall_passing_pct
FROM metrics;