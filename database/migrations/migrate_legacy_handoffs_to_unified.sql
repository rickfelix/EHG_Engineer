-- ============================================================================
-- MIGRATION: leo_handoff_executions → sd_phase_handoffs
-- ============================================================================
-- Purpose: Migrate 276 legacy handoff records to unified table
-- SD: SD-DATA-INTEGRITY-001
-- User Story: SD-DATA-INTEGRITY-001:US-001
-- Created: 2025-10-19
-- ============================================================================

-- ============================================================================
-- PHASE 1: PRE-MIGRATION VALIDATION
-- ============================================================================

DO $$
DECLARE
  legacy_count INTEGER;
  unified_count INTEGER;
  gap_count INTEGER;
BEGIN
  -- Count records
  SELECT COUNT(*) INTO legacy_count FROM leo_handoff_executions;
  SELECT COUNT(*) INTO unified_count FROM sd_phase_handoffs;
  gap_count := legacy_count - unified_count;

  RAISE NOTICE '=== PRE-MIGRATION VALIDATION ===';
  RAISE NOTICE 'Legacy table (leo_handoff_executions): % records', legacy_count;
  RAISE NOTICE 'Unified table (sd_phase_handoffs): % records', unified_count;
  RAISE NOTICE 'Gap to migrate: % records', gap_count;

  -- Validation: Ensure gap matches expectation (~276 records)
  IF gap_count < 200 OR gap_count > 350 THEN
    RAISE WARNING 'Gap count (%) is outside expected range (200-350). Review before proceeding.', gap_count;
  END IF;
END $$;

-- ============================================================================
-- PHASE 2: DATA MIGRATION
-- ============================================================================

INSERT INTO sd_phase_handoffs (
  id,
  sd_id,
  from_phase,
  to_phase,
  handoff_type,
  status,
  executive_summary,
  deliverables_manifest,
  key_decisions,
  known_issues,
  resource_utilization,
  action_items,
  completeness_report,
  metadata,
  rejection_reason,
  created_at,
  accepted_at,
  rejected_at,
  created_by
)
SELECT
  id,
  sd_id,
  -- Map from_agent → from_phase (direct copy, already using phase names)
  from_agent::VARCHAR AS from_phase,
  -- Map to_agent → to_phase (direct copy, already using phase names)
  to_agent::VARCHAR AS to_phase,
  handoff_type,
  status,
  -- Preserve nullable text fields
  executive_summary,
  -- Transform deliverables_manifest: JSONB array → TEXT
  CASE
    WHEN deliverables_manifest IS NULL THEN ''
    WHEN jsonb_array_length(deliverables_manifest) = 0 THEN ''
    ELSE deliverables_manifest::TEXT
  END AS deliverables_manifest,
  -- Transform recommendations → key_decisions
  CASE
    WHEN recommendations IS NULL THEN ''
    WHEN jsonb_array_length(recommendations) = 0 THEN ''
    ELSE 'Recommendations: ' || recommendations::TEXT
  END AS key_decisions,
  -- Transform compliance_status → known_issues
  CASE
    WHEN compliance_status IS NULL THEN ''
    WHEN compliance_status::TEXT = '{}' THEN ''
    ELSE 'Compliance: ' || compliance_status::TEXT
  END AS known_issues,
  -- Transform quality_metrics → resource_utilization
  CASE
    WHEN quality_metrics IS NULL THEN ''
    WHEN quality_metrics::TEXT = '{}' THEN ''
    ELSE 'Quality Metrics: ' || quality_metrics::TEXT
  END AS resource_utilization,
  -- Transform action_items: JSONB array → TEXT
  CASE
    WHEN action_items IS NULL THEN ''
    WHEN jsonb_array_length(action_items) = 0 THEN ''
    ELSE action_items::TEXT
  END AS action_items,
  -- Transform verification_results → completeness_report
  CASE
    WHEN verification_results IS NULL THEN ''
    WHEN verification_results::TEXT = '{}' THEN ''
    ELSE 'Verification: ' || verification_results::TEXT
  END AS completeness_report,
  -- Default metadata (empty JSONB object)
  '{}'::JSONB AS metadata,
  -- Preserve rejection_reason
  rejection_reason,
  -- Preserve timestamps
  created_at,
  accepted_at,
  -- Default rejected_at (not tracked in legacy)
  NULL AS rejected_at,
  -- Preserve creator
  created_by
FROM leo_handoff_executions
-- CRITICAL: Only insert records that don't already exist in unified table
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs)
-- Order by created_at to maintain chronological order
ORDER BY created_at ASC;

-- ============================================================================
-- PHASE 3: POST-MIGRATION VERIFICATION
-- ============================================================================

DO $$
DECLARE
  legacy_count INTEGER;
  unified_count INTEGER;
  migrated_count INTEGER;
BEGIN
  -- Count records
  SELECT COUNT(*) INTO legacy_count FROM leo_handoff_executions;
  SELECT COUNT(*) INTO unified_count FROM sd_phase_handoffs;
  migrated_count := unified_count;

  RAISE NOTICE '=== POST-MIGRATION VERIFICATION ===';
  RAISE NOTICE 'Legacy table (leo_handoff_executions): % records', legacy_count;
  RAISE NOTICE 'Unified table (sd_phase_handoffs): % records', unified_count;

  -- Validation: Counts should match (or very close)
  IF legacy_count != unified_count THEN
    RAISE WARNING 'Record counts do not match! Legacy: %, Unified: %', legacy_count, unified_count;
    RAISE WARNING 'Review migration results before proceeding.';
  ELSE
    RAISE NOTICE '✅ SUCCESS: Record counts match!';
  END IF;
END $$;

-- ============================================================================
-- PHASE 4: SAMPLE VERIFICATION (10 Random Records)
-- ============================================================================

SELECT
  'SAMPLE VERIFICATION' AS test_name,
  l.id,
  l.sd_id,
  l.handoff_type,
  l.from_agent AS legacy_from,
  u.from_phase AS unified_from,
  l.to_agent AS legacy_to,
  u.to_phase AS unified_to,
  l.status AS legacy_status,
  u.status AS unified_status,
  CASE
    WHEN l.from_agent = u.from_phase
         AND l.to_agent = u.to_phase
         AND l.status = u.status
    THEN '✅ MATCH'
    ELSE '❌ MISMATCH'
  END AS verification_result
FROM leo_handoff_executions l
JOIN sd_phase_handoffs u ON l.id = u.id
ORDER BY RANDOM()
LIMIT 10;

-- ============================================================================
-- PHASE 5: FINAL STATISTICS
-- ============================================================================

SELECT
  'FINAL STATISTICS' AS report_name,
  COUNT(*) AS total_records,
  COUNT(DISTINCT sd_id) AS distinct_sds,
  COUNT(DISTINCT handoff_type) AS distinct_handoff_types,
  COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_count,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
  MIN(created_at) AS earliest_handoff,
  MAX(created_at) AS latest_handoff
FROM sd_phase_handoffs;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Next Steps:
-- 1. Review verification results above
-- 2. If all checks pass, proceed to update calculate_sd_progress function
-- 3. Update 46 scripts to use sd_phase_handoffs instead of leo_handoff_executions
-- 4. Deprecate legacy table: RENAME TO _deprecated_leo_handoff_executions
-- 5. Add RLS policy for read-only access to deprecated table

-- Rollback Plan (if needed):
-- DELETE FROM sd_phase_handoffs WHERE created_at >= '[MIGRATION_START_TIME]';
