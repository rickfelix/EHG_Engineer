-- =============================================================================
-- DOWN / ROLLBACK Script
-- Migration: 20260531180000_competitive_intelligence_spine_DOWN.sql
-- SD: SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A (Child A)
-- Purpose: Fully reverse the UP migration.
--          Drops both tables (and their dependent indexes, triggers, policies)
--          in the correct dependency order (ci_snapshots first, then
--          competitor_intelligence, because ci_snapshots has an FK into it).
--          DOES NOT touch any pre-existing tables.
-- =============================================================================
-- WARNING: This drops all data in competitor_intelligence and ci_snapshots.
--          Only run in a context where that data loss is acceptable, or wrap
--          this script in a transaction that you ROLL BACK to verify syntax.
-- =============================================================================

-- Step 1: Drop ci_snapshots (depends on competitor_intelligence via FK CASCADE,
--         so must be dropped first to avoid FK violation on Step 2).
--         Policies, triggers, and indexes on this table are dropped automatically
--         when the table is dropped.

DROP TABLE IF EXISTS ci_snapshots CASCADE;

-- Step 2: Drop competitor_intelligence.
--         Policies, triggers, and indexes are dropped automatically.

DROP TABLE IF EXISTS competitor_intelligence CASCADE;

-- =============================================================================
-- END OF DOWN SCRIPT
-- After running this script the database is back to the pre-migration state.
-- To re-apply: run 20260531180000_competitive_intelligence_spine.sql
-- =============================================================================
