-- Tech Debt Cleanup Script
-- Removes duplicate tables created during initial implementation
-- Created: 2025-01-10

-- =============================================================================
-- CLEANUP: Remove duplicate tables that shouldn't exist
-- =============================================================================

-- Drop the duplicate PRD table
DROP TABLE IF EXISTS product_requirements_v3 CASCADE;

-- Drop the duplicate SD table and its dependent view
DROP VIEW IF EXISTS v_prd_sd_payload CASCADE;
DROP TABLE IF EXISTS strategic_directives_backlog CASCADE;

-- Note: We keep sd_backlog_map as it will be recreated properly
-- Note: We keep import_audit as it's useful and doesn't conflict

-- =============================================================================
-- Log what we cleaned up
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Tech debt cleanup completed:';
  RAISE NOTICE '- Removed product_requirements_v3 (duplicate PRD table)';
  RAISE NOTICE '- Removed strategic_directives_backlog (duplicate SD table)';
  RAISE NOTICE '- Removed v_prd_sd_payload (will recreate pointing to v2)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Apply 011_extend_existing_tables.sql to add new columns';
  RAISE NOTICE '2. Re-run import into strategic_directives_v2';
  RAISE NOTICE '3. Generate PRDs into product_requirements_v2';
END $$;