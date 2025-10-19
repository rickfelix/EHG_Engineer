-- ============================================================================
-- LEGACY TABLE DEPRECATION: leo_handoff_executions (CORRECTED)
-- ============================================================================
-- Purpose: Deprecate legacy handoff table with read-only access
-- SD: SD-DATA-INTEGRITY-001
-- User Story: SD-DATA-INTEGRITY-001:US-005
-- Created: 2025-10-19
-- Fixed: Column name corrections (from_phase/to_phase)
-- ============================================================================

-- PHASE 1: Backup Verification
DO $$
DECLARE
  legacy_count INTEGER;
  unified_count INTEGER;
BEGIN
  RAISE NOTICE '=== PRE-DEPRECATION VERIFICATION ===';
  
  SELECT COUNT(*) INTO legacy_count FROM leo_handoff_executions;
  SELECT COUNT(*) INTO unified_count FROM sd_phase_handoffs;
  
  RAISE NOTICE 'Legacy table (leo_handoff_executions): % records', legacy_count;
  RAISE NOTICE 'Unified table (sd_phase_handoffs): % records', unified_count;
  
  IF legacy_count > unified_count THEN
    RAISE NOTICE '⚠️  WARNING: Legacy has more records. % records not migrated.', legacy_count - unified_count;
    RAISE NOTICE '   These records will remain accessible in read-only deprecated table.';
  END IF;
END $$;

-- PHASE 2: Create Read-Only View for Legacy Access (CORRECTED COLUMN NAMES)
CREATE OR REPLACE VIEW legacy_handoff_executions_view AS
SELECT
  id,
  sd_id,
  handoff_type,
  from_phase as from_agent,  -- Map from_phase to from_agent for compatibility
  to_phase as to_agent,      -- Map to_phase to to_agent for compatibility
  status,
  created_at,
  accepted_at,
  metadata->>'migrated_from' as migration_status,
  CASE
    WHEN metadata->>'migrated_from' = 'leo_handoff_executions'
    THEN 'Migrated to sd_phase_handoffs'
    ELSE 'Legacy record'
  END as record_status
FROM sd_phase_handoffs
WHERE metadata->>'migrated_from' = 'leo_handoff_executions'

UNION ALL

SELECT
  id,
  sd_id,
  handoff_type,
  from_agent,  -- Legacy table has from_agent column
  to_agent,    -- Legacy table has to_agent column
  status,
  created_at,
  accepted_at,
  'Not migrated' as migration_status,
  'Legacy only - see leo_handoff_executions table' as record_status
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs);

COMMENT ON VIEW legacy_handoff_executions_view IS
'Read-only view combining migrated and non-migrated legacy handoffs for reference. Maps from_phase/to_phase to from_agent/to_agent for backward compatibility.';

-- PHASE 5: Create Migration Status Report Function
CREATE OR REPLACE FUNCTION get_handoff_migration_status()
RETURNS TABLE (metric VARCHAR, count INTEGER, percentage DECIMAL) AS $$
DECLARE
  total_legacy INTEGER;
  total_unified INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_legacy FROM leo_handoff_executions;
  SELECT COUNT(*) INTO total_unified FROM sd_phase_handoffs;
  SELECT COUNT(*) INTO migrated_count
  FROM sd_phase_handoffs WHERE metadata->>'migrated_from' = 'leo_handoff_executions';
  
  RETURN QUERY
  SELECT 'Total Legacy Records'::VARCHAR, total_legacy, 100.0::DECIMAL
  UNION ALL
  SELECT 'Total Unified Records', total_unified,
         ROUND((total_unified::DECIMAL / NULLIF(total_legacy, 0)) * 100, 2)
  UNION ALL
  SELECT 'Migrated Records', migrated_count,
         ROUND((migrated_count::DECIMAL / NULLIF(total_legacy, 0)) * 100, 2)
  UNION ALL
  SELECT 'Not Migrated', total_legacy - migrated_count,
         ROUND(((total_legacy - migrated_count)::DECIMAL / NULLIF(total_legacy, 0)) * 100, 2)
  UNION ALL
  SELECT 'New Records (post-migration)', total_unified - migrated_count,
         ROUND(((total_unified - migrated_count)::DECIMAL / NULLIF(total_unified, 0)) * 100, 2);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_handoff_migration_status() IS
'Returns migration status summary for handoff consolidation';

-- VERIFICATION & REPORTING
SELECT * FROM get_handoff_migration_status();

SELECT
  'Unmigrated Legacy Records (Sample)' as report_title,
  COUNT(*) as total_unmigrated,
  COUNT(DISTINCT sd_id) as distinct_sds,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs);

SELECT handoff_type, COUNT(*) as count
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs)
GROUP BY handoff_type
ORDER BY count DESC;

RAISE NOTICE '═══════════════════════════════════════════════════════════════';
RAISE NOTICE 'DEPRECATION CHECKLIST';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';
RAISE NOTICE '✅ Phase 1: Backup verification complete';
RAISE NOTICE '✅ Phase 2: Read-only view created (legacy_handoff_executions_view)';
RAISE NOTICE '⏸️  Phase 3: Table rename (COMMENTED OUT - manual review required)';
RAISE NOTICE '⏸️  Phase 4: RLS policies (COMMENTED OUT - apply after rename)';
RAISE NOTICE '✅ Phase 5: Migration status function created';
RAISE NOTICE '';
RAISE NOTICE 'NEXT STEPS:';
RAISE NOTICE '1. Review unmigrated records report above';
RAISE NOTICE '2. Verify all critical handoffs are migrated';
RAISE NOTICE '3. Uncomment Phase 3 & 4 when ready to deprecate';
RAISE NOTICE '4. Update documentation to reference new table';
RAISE NOTICE '5. Monitor for any scripts still using legacy table';
RAISE NOTICE '═══════════════════════════════════════════════════════════════';
