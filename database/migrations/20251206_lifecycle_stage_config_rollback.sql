-- Rollback Migration: Lifecycle Stage Configuration Table
-- SD: SD-VISION-TRANSITION-001D
-- Date: 2025-12-09
-- Purpose: Reverse the lifecycle_stage_config migration (20251206_lifecycle_stage_config.sql)
--
-- USAGE: Execute this script ONLY if Migration Phase A needs to be reversed.
-- WARNING: This will DELETE all lifecycle stage configuration data.
--
-- ============================================================================
-- ROLLBACK SEQUENCE (reverse order of creation)
-- ============================================================================

-- 1. Drop helper functions first (they depend on tables)
DROP FUNCTION IF EXISTS get_stages_by_phase(INT);
DROP FUNCTION IF EXISTS get_sd_required_stages();
DROP FUNCTION IF EXISTS get_stage_info(INT);

-- 2. Drop indexes
DROP INDEX IF EXISTS idx_advisory_checkpoints_stage;
DROP INDEX IF EXISTS idx_lifecycle_stage_sd_required;
DROP INDEX IF EXISTS idx_lifecycle_stage_work_type;
DROP INDEX IF EXISTS idx_lifecycle_stage_phase;

-- 3. Drop advisory_checkpoints table (depends on lifecycle_stage_config)
DROP TABLE IF EXISTS advisory_checkpoints;

-- 4. Drop lifecycle_stage_config table
DROP TABLE IF EXISTS lifecycle_stage_config;

-- 5. Drop lifecycle_phases table
DROP TABLE IF EXISTS lifecycle_phases;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After rollback, verify with:
-- SELECT COUNT(*) FROM lifecycle_stage_config; -- Should error: relation does not exist
-- SELECT COUNT(*) FROM lifecycle_phases;       -- Should error: relation does not exist
-- SELECT COUNT(*) FROM advisory_checkpoints;   -- Should error: relation does not exist

-- ============================================================================
-- NOTES
-- ============================================================================
-- This rollback does NOT restore the 40-stage workflow.
-- To restore 40-stage workflow, additional migrations would be needed.
-- The 25-stage lifecycle can be re-applied by running 20251206_lifecycle_stage_config.sql.
