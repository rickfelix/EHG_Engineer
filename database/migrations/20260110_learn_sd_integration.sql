-- Migration: Learn → SD Integration
-- Date: 2026-01-10
-- Purpose: Add assigned_sd_id columns to link patterns/improvements to Strategic Directives
--
-- This enables the /learn command to create SDs instead of directly inserting metadata.
-- When an SD completes, patterns/improvements are automatically resolved.

-- ============================================================================
-- 1. Add columns to issue_patterns table
-- ============================================================================

-- Add assigned_sd_id column (FK to strategic_directives_v2)
ALTER TABLE issue_patterns
ADD COLUMN IF NOT EXISTS assigned_sd_id VARCHAR(50)
REFERENCES strategic_directives_v2(id) ON DELETE SET NULL;

-- Add assignment_date to track when pattern was assigned
ALTER TABLE issue_patterns
ADD COLUMN IF NOT EXISTS assignment_date TIMESTAMPTZ;

-- Create index for efficient lookups by assigned SD
CREATE INDEX IF NOT EXISTS idx_issue_patterns_assigned_sd
ON issue_patterns(assigned_sd_id)
WHERE assigned_sd_id IS NOT NULL;

-- ============================================================================
-- 2. Add columns to protocol_improvement_queue table
-- ============================================================================

-- Add assigned_sd_id column (FK to strategic_directives_v2)
ALTER TABLE protocol_improvement_queue
ADD COLUMN IF NOT EXISTS assigned_sd_id VARCHAR(50)
REFERENCES strategic_directives_v2(id) ON DELETE SET NULL;

-- Add assignment_date to track when improvement was assigned
ALTER TABLE protocol_improvement_queue
ADD COLUMN IF NOT EXISTS assignment_date TIMESTAMPTZ;

-- Create index for efficient lookups by assigned SD
CREATE INDEX IF NOT EXISTS idx_protocol_queue_assigned_sd
ON protocol_improvement_queue(assigned_sd_id)
WHERE assigned_sd_id IS NOT NULL;

-- ============================================================================
-- 3. Add 'assigned' status to issue_patterns (if not exists via check constraint)
-- ============================================================================

-- Note: PostgreSQL doesn't have ALTER TYPE ADD VALUE IF NOT EXISTS in older versions
-- We'll check and add if needed using a DO block
DO $$
BEGIN
    -- Check if the status column has a check constraint that needs updating
    -- For now, we allow any status value (active, assigned, resolved, obsolete)
    -- The application layer will enforce valid values
    NULL;
END $$;

-- ============================================================================
-- 4. Add 'SD_CREATED' status to protocol_improvement_queue
-- ============================================================================

-- Similar to above, status is managed at application level
-- Valid values: PENDING, APPROVED, SD_CREATED, APPLIED, REJECTED, SUPERSEDED

-- ============================================================================
-- 5. Add sd_created_id to learning_decisions table
-- ============================================================================

ALTER TABLE learning_decisions
ADD COLUMN IF NOT EXISTS sd_created_id VARCHAR(50)
REFERENCES strategic_directives_v2(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. Create view for patterns pending assignment
-- ============================================================================

CREATE OR REPLACE VIEW v_patterns_available_for_sd AS
SELECT
    p.pattern_id,
    p.category,
    p.severity,
    p.issue_summary,
    p.occurrence_count,
    p.status,
    p.trend,
    p.assigned_sd_id,
    CASE
        WHEN p.assigned_sd_id IS NOT NULL THEN
            (SELECT s.status FROM strategic_directives_v2 s WHERE s.id = p.assigned_sd_id)
        ELSE NULL
    END as assigned_sd_status,
    p.created_at,
    p.updated_at
FROM issue_patterns p
WHERE p.status = 'active'
   OR (p.status = 'assigned' AND p.assigned_sd_id IS NOT NULL);

-- Grant access
GRANT SELECT ON v_patterns_available_for_sd TO authenticated;
GRANT SELECT ON v_patterns_available_for_sd TO service_role;

-- ============================================================================
-- 7. Create function to resolve patterns when SD completes
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_patterns_for_completed_sd(completed_sd_id VARCHAR(50))
RETURNS TABLE(pattern_id VARCHAR, previous_status VARCHAR, new_status VARCHAR) AS $$
BEGIN
    RETURN QUERY
    WITH updated AS (
        UPDATE issue_patterns
        SET status = 'resolved',
            resolution_date = NOW(),
            resolution_notes = 'Resolved by ' || completed_sd_id || ' via /learn workflow'
        WHERE assigned_sd_id = completed_sd_id
          AND status = 'assigned'
        RETURNING issue_patterns.pattern_id, 'assigned'::VARCHAR as old_status, 'resolved'::VARCHAR as new_status
    )
    SELECT * FROM updated;

    -- Also update improvements
    UPDATE protocol_improvement_queue
    SET status = 'APPLIED',
        applied_at = NOW()
    WHERE assigned_sd_id = completed_sd_id
      AND status = 'SD_CREATED';
END;
$$ LANGUAGE plpgsql;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION resolve_patterns_for_completed_sd TO service_role;

-- ============================================================================
-- 8. Create function to get next SD-LEARN ID
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_learn_sd_id()
RETURNS VARCHAR(50) AS $$
DECLARE
    max_num INTEGER;
    next_id VARCHAR(50);
BEGIN
    -- Find the highest SD-LEARN-NNN number
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(id FROM 'SD-LEARN-(\d+)') AS INTEGER)
    ), 0)
    INTO max_num
    FROM strategic_directives_v2
    WHERE id ~ '^SD-LEARN-\d+$';

    -- Generate next ID with zero-padded number
    next_id := 'SD-LEARN-' || LPAD((max_num + 1)::TEXT, 3, '0');

    RETURN next_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute
GRANT EXECUTE ON FUNCTION get_next_learn_sd_id TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_learn_sd_id TO service_role;

-- ============================================================================
-- 9. Add comment documentation
-- ============================================================================

COMMENT ON COLUMN issue_patterns.assigned_sd_id IS
    'SD that will address this pattern. Set by /learn command when user approves.';

COMMENT ON COLUMN issue_patterns.assignment_date IS
    'When pattern was assigned to an SD via /learn.';

COMMENT ON COLUMN protocol_improvement_queue.assigned_sd_id IS
    'SD that will implement this improvement. Set by /learn command when user approves.';

COMMENT ON COLUMN protocol_improvement_queue.assignment_date IS
    'When improvement was assigned to an SD via /learn.';

COMMENT ON COLUMN learning_decisions.sd_created_id IS
    'SD created as a result of this learning decision. NULL if no SD was created.';

COMMENT ON FUNCTION resolve_patterns_for_completed_sd IS
    'Call when an SD created from /learn completes. Resolves all assigned patterns and improvements.';

COMMENT ON FUNCTION get_next_learn_sd_id IS
    'Returns the next available SD-LEARN-NNN ID (e.g., SD-LEARN-003).';
