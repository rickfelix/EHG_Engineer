-- Migration: Update status constraints for /learn workflow
-- Date: 2026-01-10
-- Purpose: Add SD_CREATED status to protocol_improvement_queue
--          Add 'assigned' status to issue_patterns

-- ============================================================================
-- 1. Update protocol_improvement_queue status constraint
-- ============================================================================

-- Drop existing constraint
ALTER TABLE protocol_improvement_queue
DROP CONSTRAINT IF EXISTS protocol_improvement_queue_status_check;

-- Add new constraint with SD_CREATED
ALTER TABLE protocol_improvement_queue
ADD CONSTRAINT protocol_improvement_queue_status_check
CHECK (status IN ('PENDING', 'APPROVED', 'SD_CREATED', 'APPLIED', 'REJECTED', 'SUPERSEDED'));

-- ============================================================================
-- 2. Update issue_patterns status constraint (if exists)
-- ============================================================================

-- Drop existing constraint if it exists
ALTER TABLE issue_patterns
DROP CONSTRAINT IF EXISTS issue_patterns_status_check;

-- Add constraint with 'assigned' status
ALTER TABLE issue_patterns
ADD CONSTRAINT issue_patterns_status_check
CHECK (status IN ('active', 'assigned', 'resolved', 'obsolete'));

-- ============================================================================
-- 3. Verify constraints
-- ============================================================================

-- These queries will fail if constraints are wrong, confirming they work
-- (Comment out for production, use for testing)
-- INSERT INTO protocol_improvement_queue (status) VALUES ('SD_CREATED');
-- INSERT INTO issue_patterns (status) VALUES ('assigned');
