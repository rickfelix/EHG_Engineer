-- Migration: Duplicate Index Cleanup and Missing Indexes
-- SD: SD-LEO-FIX-DATABASE-DUPLICATE-INDEX-001
-- Date: 2026-03-17
-- Author: Database Agent (Opus 4.6)
--
-- Description:
--   1. Remove duplicate UNIQUE constraint on strategic_directives_v2.sd_key
--      (strategic_directives_v2_sd_key_unique was a duplicate of sd_key_key)
--   2. Remove redundant plain index on strategic_directives_v2.sd_key
--      (idx_strategic_directives_v2_sd_key was redundant with unique index)
--   3. Remove duplicate index on strategic_directives_v2.parent_sd_id
--      (idx_sd_parent_sd_id was identical to idx_sd_parent)
--   4. Add missing index on workflow_trace_log.sd_id (244K rows)
--   5. Add missing index on workflow_trace_log.phase
--   6. Add missing index on governance_audit_log.operation (139K rows)
--
-- Safety: All DROP operations verified against constraint dependencies.
--   - strategic_directives_v2_sd_key_key (original) was KEPT as it backs
--     the UNIQUE(sd_key) constraint and gap_analysis_results FK.
--   - idx_sd_parent (original) was KEPT for parent_sd_id lookups.
--
-- Storage freed: ~368 KB from dropped duplicate indexes
-- Storage added: ~4.5 MB for new indexes on large tables
--
-- EXECUTED: 2026-03-17 (all operations completed successfully)

-- =============================================================================
-- PHASE 1: Drop duplicate/redundant indexes
-- =============================================================================

-- 1a. Drop duplicate UNIQUE constraint on sd_key
-- Kept: strategic_directives_v2_sd_key_key (OID 47711, original)
-- Dropped: strategic_directives_v2_sd_key_unique (OID 322531, duplicate)
ALTER TABLE strategic_directives_v2
  DROP CONSTRAINT IF EXISTS strategic_directives_v2_sd_key_unique;

-- 1b. Drop redundant plain btree index on sd_key
-- The unique index strategic_directives_v2_sd_key_key already covers equality lookups
DROP INDEX IF EXISTS idx_strategic_directives_v2_sd_key;

-- 2. Drop duplicate parent_sd_id index
-- Kept: idx_sd_parent (btree on parent_sd_id)
-- Dropped: idx_sd_parent_sd_id (identical btree on parent_sd_id)
DROP INDEX IF EXISTS idx_sd_parent_sd_id;

-- =============================================================================
-- PHASE 2: Create missing indexes
-- =============================================================================

-- 3. Index on workflow_trace_log(sd_id) for SD-scoped trace queries
-- Table has ~244K rows, sd_id is frequently used in WHERE clauses
CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_sd_id
  ON workflow_trace_log(sd_id);

-- 4. Index on workflow_trace_log(phase) for phase-based filtering
CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_phase
  ON workflow_trace_log(phase);

-- 5. Index on governance_audit_log(operation) for operation-type filtering
-- Table has ~139K rows
CREATE INDEX IF NOT EXISTS idx_audit_operation
  ON governance_audit_log(operation);

-- =============================================================================
-- VERIFICATION QUERIES (run after migration)
-- =============================================================================

-- Verify only one sd_key unique constraint remains:
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'strategic_directives_v2'::regclass AND conname LIKE '%sd_key%';
-- Expected: strategic_directives_v2_sd_key_key (only)

-- Verify only one parent_sd_id index remains:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'strategic_directives_v2' AND indexdef LIKE '%parent_sd_id%';
-- Expected: idx_sd_parent (only)

-- Verify new indexes exist:
-- SELECT indexname FROM pg_indexes
-- WHERE indexname IN ('idx_workflow_trace_log_sd_id', 'idx_workflow_trace_log_phase', 'idx_audit_operation');
-- Expected: all three

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================
-- To rollback (re-create dropped indexes/constraints):
--
-- ALTER TABLE strategic_directives_v2
--   ADD CONSTRAINT strategic_directives_v2_sd_key_unique UNIQUE (sd_key);
--
-- CREATE INDEX idx_strategic_directives_v2_sd_key
--   ON strategic_directives_v2(sd_key);
--
-- CREATE INDEX idx_sd_parent_sd_id
--   ON strategic_directives_v2(parent_sd_id);
--
-- DROP INDEX IF EXISTS idx_workflow_trace_log_sd_id;
-- DROP INDEX IF EXISTS idx_workflow_trace_log_phase;
-- DROP INDEX IF EXISTS idx_audit_operation;
