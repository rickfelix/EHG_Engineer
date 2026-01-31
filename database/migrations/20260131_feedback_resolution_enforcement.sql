-- Migration: Feedback Resolution Enforcement
-- SD: SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001
-- Date: 2026-01-31
-- Purpose: Add status-dependent validation for feedback resolution
--
-- Technical Requirements:
-- TR-1: Implement CHECK constraints for status-dependent requirements
-- TR-2: Add foreign keys with ON DELETE RESTRICT
-- TR-3: Provide migration with preflight validation for existing data
-- TR-4: Add structured logging for constraint violations

-- =============================================================================
-- PHASE 1: PREFLIGHT VALIDATION
-- =============================================================================
-- Verify existing data before schema changes to prevent migration failures

DO $$
DECLARE
    v_invalid_count INTEGER;
    v_error_msg TEXT;
    v_violations JSONB;
BEGIN
    -- Log migration start
    RAISE NOTICE '[PREFLIGHT] Starting validation for feedback resolution enforcement migration';
    RAISE NOTICE '[PREFLIGHT] Timestamp: %', NOW();

    -- Check 1: Verify target tables exist
    RAISE NOTICE '[PREFLIGHT] Checking target tables exist...';

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quick_fixes') THEN
        RAISE EXCEPTION '[PREFLIGHT] CRITICAL: quick_fixes table does not exist';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'strategic_directives_v2') THEN
        RAISE EXCEPTION '[PREFLIGHT] CRITICAL: strategic_directives_v2 table does not exist';
    END IF;

    RAISE NOTICE '[PREFLIGHT] ✓ All target tables exist';

    -- Check 2: Verify feedback table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback') THEN
        RAISE EXCEPTION '[PREFLIGHT] CRITICAL: feedback table does not exist';
    END IF;

    RAISE NOTICE '[PREFLIGHT] ✓ feedback table exists';

    -- Check 3: Identify feedback rows with status='resolved' missing resolution references
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM feedback
    WHERE status = 'resolved'
      AND resolution_sd_id IS NULL  -- No SD reference
      AND resolution_notes IS NULL; -- No notes either

    IF v_invalid_count > 0 THEN
        RAISE WARNING '[PREFLIGHT] Found % feedback rows with status=resolved but no resolution_sd_id or notes', v_invalid_count;
        RAISE NOTICE '[PREFLIGHT] These rows will need manual review after migration';

        -- Log details for manual review
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', id,
                'title', title,
                'status', status,
                'resolved_at', resolved_at
            )
        )
        INTO v_violations
        FROM feedback
        WHERE status = 'resolved'
          AND resolution_sd_id IS NULL
          AND resolution_notes IS NULL
        LIMIT 10;

        RAISE NOTICE '[PREFLIGHT] Sample violations: %', v_violations;
    ELSE
        RAISE NOTICE '[PREFLIGHT] ✓ No invalid resolved status rows found';
    END IF;

    -- Check 4: Identify feedback rows with status='wont_fix' missing resolution_notes
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM feedback
    WHERE status = 'wont_fix'
      AND (resolution_notes IS NULL OR resolution_notes = '');

    IF v_invalid_count > 0 THEN
        RAISE WARNING '[PREFLIGHT] Found % feedback rows with status=wont_fix but no resolution_notes', v_invalid_count;
        RAISE NOTICE '[PREFLIGHT] These rows will need manual review after migration';
    ELSE
        RAISE NOTICE '[PREFLIGHT] ✓ No invalid wont_fix status rows found';
    END IF;

    -- Check 5: Verify 'duplicate' status is NOT currently in use (since it's not in constraint)
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM feedback
    WHERE status = 'duplicate';

    IF v_invalid_count > 0 THEN
        RAISE WARNING '[PREFLIGHT] Found % feedback rows with status=duplicate (not in current constraint)', v_invalid_count;
        RAISE NOTICE '[PREFLIGHT] This is expected if duplicate status was used before constraint update';
    ELSE
        RAISE NOTICE '[PREFLIGHT] ✓ No duplicate status rows found';
    END IF;

    RAISE NOTICE '[PREFLIGHT] ============================================';
    RAISE NOTICE '[PREFLIGHT] Validation complete. Proceeding with migration.';
    RAISE NOTICE '[PREFLIGHT] ============================================';

END $$;

-- =============================================================================
-- PHASE 2: ADD NEW COLUMNS
-- =============================================================================

-- Add quick_fix_id column (FK to quick_fixes.id)
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS quick_fix_id TEXT NULL;

COMMENT ON COLUMN feedback.quick_fix_id IS
'Foreign key to quick_fixes.id. When feedback is resolved via a quick fix, this references the QF-YYYYMMDD-NNN identifier. Required when status=resolved (unless strategic_directive_id is set).';

-- Add strategic_directive_id column (FK to strategic_directives_v2.id)
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS strategic_directive_id VARCHAR(50) NULL;

COMMENT ON COLUMN feedback.strategic_directive_id IS
'Foreign key to strategic_directives_v2.id. When feedback is resolved via a full Strategic Directive, this references the SD-XXX-NNN identifier. Required when status=resolved (unless quick_fix_id is set).';

-- Add duplicate_of_id column (self-referencing FK to feedback.id)
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS duplicate_of_id UUID NULL;

COMMENT ON COLUMN feedback.duplicate_of_id IS
'Foreign key to feedback.id (self-reference). When status=duplicate, this references the original feedback item that this one duplicates. Cannot reference itself (enforced by CHECK constraint).';

DO $$ BEGIN RAISE NOTICE '[MIGRATION] ✓ Added new columns: quick_fix_id, strategic_directive_id, duplicate_of_id'; END $$;

-- =============================================================================
-- PHASE 3: UPDATE STATUS CONSTRAINT (Add 'duplicate' status)
-- =============================================================================

-- Drop existing status constraint
ALTER TABLE feedback
DROP CONSTRAINT IF EXISTS feedback_status_check;

-- Recreate constraint with 'duplicate' status added
ALTER TABLE feedback
ADD CONSTRAINT feedback_status_check
CHECK (
    (status)::text = ANY (
        ARRAY[
            'new'::character varying,
            'triaged'::character varying,
            'in_progress'::character varying,
            'resolved'::character varying,
            'wont_fix'::character varying,
            'duplicate'::character varying,  -- NEW STATUS
            'invalid'::character varying,     -- NEW STATUS
            'backlog'::character varying,
            'shipped'::character varying
        ]::text[]
    )
);

DO $$ BEGIN RAISE NOTICE '[MIGRATION] ✓ Updated status constraint to include duplicate and invalid'; END $$;

-- =============================================================================
-- PHASE 4: ADD FOREIGN KEY CONSTRAINTS
-- =============================================================================

-- FK: quick_fix_id -> quick_fixes.id
ALTER TABLE feedback
ADD CONSTRAINT fk_feedback_quick_fix
FOREIGN KEY (quick_fix_id)
REFERENCES quick_fixes(id)
ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_feedback_quick_fix ON feedback IS
'Ensures quick_fix_id references a valid quick fix. ON DELETE RESTRICT prevents deletion of quick fixes that have linked feedback.';

-- FK: strategic_directive_id -> strategic_directives_v2.id
ALTER TABLE feedback
ADD CONSTRAINT fk_feedback_strategic_directive
FOREIGN KEY (strategic_directive_id)
REFERENCES strategic_directives_v2(id)
ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_feedback_strategic_directive ON feedback IS
'Ensures strategic_directive_id references a valid SD. ON DELETE RESTRICT prevents deletion of SDs that have linked feedback.';

-- FK: duplicate_of_id -> feedback.id (self-reference)
ALTER TABLE feedback
ADD CONSTRAINT fk_feedback_duplicate_of
FOREIGN KEY (duplicate_of_id)
REFERENCES feedback(id)
ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_feedback_duplicate_of ON feedback IS
'Self-referencing FK to mark duplicate feedback. ON DELETE RESTRICT prevents deletion of original feedback if duplicates exist.';

DO $$ BEGIN RAISE NOTICE '[MIGRATION] ✓ Added foreign key constraints'; END $$;

-- =============================================================================
-- PHASE 5: ADD STATUS-DEPENDENT CHECK CONSTRAINTS (TR-1)
-- =============================================================================

-- Constraint: status='resolved' requires quick_fix_id OR strategic_directive_id OR resolution_sd_id OR resolution_notes
-- Note: resolution_sd_id and resolution_notes are EXISTING columns for backward compatibility
ALTER TABLE feedback
ADD CONSTRAINT chk_resolved_requires_reference
CHECK (
    status <> 'resolved' OR (
        quick_fix_id IS NOT NULL
        OR strategic_directive_id IS NOT NULL
        OR resolution_sd_id IS NOT NULL
        OR (resolution_notes IS NOT NULL AND LENGTH(TRIM(resolution_notes)) > 0)
    )
);

COMMENT ON CONSTRAINT chk_resolved_requires_reference ON feedback IS
'TR-1: When status=resolved, at least one resolution reference must be set (quick_fix_id, strategic_directive_id, resolution_sd_id, or resolution_notes). Ensures resolution is traceable.';

-- Constraint: status='wont_fix' requires non-empty resolution_notes
ALTER TABLE feedback
ADD CONSTRAINT chk_wont_fix_requires_notes
CHECK (
    status <> 'wont_fix' OR (resolution_notes IS NOT NULL AND LENGTH(TRIM(resolution_notes)) > 0)
);

COMMENT ON CONSTRAINT chk_wont_fix_requires_notes ON feedback IS
'TR-1: When status=wont_fix, resolution_notes must be non-empty. Ensures rejection is explained.';

-- Constraint: status='duplicate' requires duplicate_of_id (not self-referencing)
ALTER TABLE feedback
ADD CONSTRAINT chk_duplicate_requires_reference
CHECK (
    status <> 'duplicate' OR (duplicate_of_id IS NOT NULL AND duplicate_of_id <> id)
);

COMMENT ON CONSTRAINT chk_duplicate_requires_reference ON feedback IS
'TR-1: When status=duplicate, duplicate_of_id must be set and cannot reference itself. Ensures duplicate is linked to original.';

-- Constraint: status='invalid' has no additional requirements (permissive)
-- No constraint needed - invalid status can be set without additional fields

DO $$ BEGIN RAISE NOTICE '[MIGRATION] ✓ Added status-dependent CHECK constraints'; END $$;

-- =============================================================================
-- PHASE 6: CREATE INDEXES FOR FOREIGN KEYS (Performance)
-- =============================================================================

-- Index on quick_fix_id for faster FK lookups
CREATE INDEX IF NOT EXISTS idx_feedback_quick_fix_id
ON feedback(quick_fix_id)
WHERE quick_fix_id IS NOT NULL;

-- Index on strategic_directive_id for faster FK lookups
CREATE INDEX IF NOT EXISTS idx_feedback_strategic_directive_id
ON feedback(strategic_directive_id)
WHERE strategic_directive_id IS NOT NULL;

-- Index on duplicate_of_id for faster FK lookups and duplicate tracking
CREATE INDEX IF NOT EXISTS idx_feedback_duplicate_of_id
ON feedback(duplicate_of_id)
WHERE duplicate_of_id IS NOT NULL;

DO $$ BEGIN RAISE NOTICE '[MIGRATION] ✓ Created indexes for foreign keys'; END $$;

-- =============================================================================
-- PHASE 7: STRUCTURED LOGGING FUNCTION (TR-4)
-- =============================================================================

-- Create function to log constraint violations with structured data
CREATE OR REPLACE FUNCTION log_feedback_resolution_violation()
RETURNS TRIGGER AS $$
DECLARE
    v_violation_type TEXT;
    v_violation_details JSONB;
BEGIN
    -- Determine violation type
    IF NEW.status = 'resolved' AND NEW.quick_fix_id IS NULL AND NEW.strategic_directive_id IS NULL THEN
        v_violation_type := 'resolved_missing_reference';
        v_violation_details := jsonb_build_object(
            'feedback_id', NEW.id,
            'title', NEW.title,
            'status', NEW.status,
            'quick_fix_id', NEW.quick_fix_id,
            'strategic_directive_id', NEW.strategic_directive_id,
            'violation', 'status=resolved requires quick_fix_id OR strategic_directive_id'
        );
    ELSIF NEW.status = 'wont_fix' AND (NEW.resolution_notes IS NULL OR LENGTH(TRIM(NEW.resolution_notes)) = 0) THEN
        v_violation_type := 'wont_fix_missing_notes';
        v_violation_details := jsonb_build_object(
            'feedback_id', NEW.id,
            'title', NEW.title,
            'status', NEW.status,
            'resolution_notes', NEW.resolution_notes,
            'violation', 'status=wont_fix requires non-empty resolution_notes'
        );
    ELSIF NEW.status = 'duplicate' AND (NEW.duplicate_of_id IS NULL OR NEW.duplicate_of_id = NEW.id) THEN
        v_violation_type := 'duplicate_invalid_reference';
        v_violation_details := jsonb_build_object(
            'feedback_id', NEW.id,
            'title', NEW.title,
            'status', NEW.status,
            'duplicate_of_id', NEW.duplicate_of_id,
            'violation', 'status=duplicate requires valid duplicate_of_id (not self-referencing)'
        );
    ELSE
        -- No violation
        RETURN NEW;
    END IF;

    -- Log the violation (structured logging for observability)
    RAISE WARNING '[FEEDBACK_RESOLUTION_VIOLATION] Type: %, Details: %',
        v_violation_type,
        v_violation_details;

    -- Constraint will fail after trigger, but we've logged structured details
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_feedback_resolution_violation() IS
'TR-4: Trigger function to log structured violation details before CHECK constraint fails. Provides observability for resolution enforcement.';

-- Create trigger to log violations before they fail
DROP TRIGGER IF EXISTS trg_log_feedback_resolution_violation ON feedback;

CREATE TRIGGER trg_log_feedback_resolution_violation
    BEFORE INSERT OR UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION log_feedback_resolution_violation();

DO $$ BEGIN RAISE NOTICE '[MIGRATION] ✓ Created structured logging trigger'; END $$;

-- =============================================================================
-- PHASE 8: MIGRATION COMPLETION SUMMARY
-- =============================================================================

DO $$
DECLARE
    v_total_feedback INTEGER;
    v_resolved_count INTEGER;
    v_wont_fix_count INTEGER;
    v_duplicate_count INTEGER;
    v_invalid_count INTEGER;
BEGIN
    -- Get feedback statistics
    SELECT COUNT(*) INTO v_total_feedback FROM feedback;
    SELECT COUNT(*) INTO v_resolved_count FROM feedback WHERE status = 'resolved';
    SELECT COUNT(*) INTO v_wont_fix_count FROM feedback WHERE status = 'wont_fix';
    SELECT COUNT(*) INTO v_duplicate_count FROM feedback WHERE status = 'duplicate';
    SELECT COUNT(*) INTO v_invalid_count FROM feedback WHERE status = 'invalid';

    RAISE NOTICE '[MIGRATION] ============================================';
    RAISE NOTICE '[MIGRATION] MIGRATION COMPLETE';
    RAISE NOTICE '[MIGRATION] ============================================';
    RAISE NOTICE '[MIGRATION] SD: SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001';
    RAISE NOTICE '[MIGRATION] Timestamp: %', NOW();
    RAISE NOTICE '[MIGRATION] ';
    RAISE NOTICE '[MIGRATION] Changes Applied:';
    RAISE NOTICE '[MIGRATION]   ✓ Added 3 new columns (quick_fix_id, strategic_directive_id, duplicate_of_id)';
    RAISE NOTICE '[MIGRATION]   ✓ Updated status constraint (added duplicate, invalid)';
    RAISE NOTICE '[MIGRATION]   ✓ Added 3 foreign key constraints (ON DELETE RESTRICT)';
    RAISE NOTICE '[MIGRATION]   ✓ Added 3 status-dependent CHECK constraints';
    RAISE NOTICE '[MIGRATION]   ✓ Created 3 performance indexes';
    RAISE NOTICE '[MIGRATION]   ✓ Added structured logging trigger';
    RAISE NOTICE '[MIGRATION] ';
    RAISE NOTICE '[MIGRATION] Current Feedback Statistics:';
    RAISE NOTICE '[MIGRATION]   Total feedback items: %', v_total_feedback;
    RAISE NOTICE '[MIGRATION]   Status=resolved: %', v_resolved_count;
    RAISE NOTICE '[MIGRATION]   Status=wont_fix: %', v_wont_fix_count;
    RAISE NOTICE '[MIGRATION]   Status=duplicate: %', v_duplicate_count;
    RAISE NOTICE '[MIGRATION]   Status=invalid: %', v_invalid_count;
    RAISE NOTICE '[MIGRATION] ';
    RAISE NOTICE '[MIGRATION] Next Steps:';
    RAISE NOTICE '[MIGRATION]   1. Review any preflight warnings above';
    RAISE NOTICE '[MIGRATION]   2. Update application code to populate new FK columns';
    RAISE NOTICE '[MIGRATION]   3. Test constraint enforcement with sample data';
    RAISE NOTICE '[MIGRATION]   4. Monitor structured logs for violations';
    RAISE NOTICE '[MIGRATION] ============================================';
END $$;

-- =============================================================================
-- ROLLBACK SCRIPT (For emergency use only)
-- =============================================================================
-- UNCOMMENT TO ROLLBACK (USE WITH EXTREME CAUTION)
/*
-- Drop trigger and function
DROP TRIGGER IF EXISTS trg_log_feedback_resolution_violation ON feedback;
DROP FUNCTION IF EXISTS log_feedback_resolution_violation();

-- Drop indexes
DROP INDEX IF EXISTS idx_feedback_quick_fix_id;
DROP INDEX IF EXISTS idx_feedback_strategic_directive_id;
DROP INDEX IF EXISTS idx_feedback_duplicate_of_id;

-- Drop CHECK constraints
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS chk_resolved_requires_reference;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS chk_wont_fix_requires_notes;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS chk_duplicate_requires_reference;

-- Drop foreign key constraints
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS fk_feedback_quick_fix;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS fk_feedback_strategic_directive;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS fk_feedback_duplicate_of;

-- Restore original status constraint (without duplicate, invalid)
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_status_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check
CHECK (
    (status)::text = ANY (
        ARRAY[
            'new'::character varying,
            'triaged'::character varying,
            'in_progress'::character varying,
            'resolved'::character varying,
            'wont_fix'::character varying,
            'backlog'::character varying,
            'shipped'::character varying
        ]::text[]
    )
);

-- Drop new columns
ALTER TABLE feedback DROP COLUMN IF EXISTS quick_fix_id;
ALTER TABLE feedback DROP COLUMN IF EXISTS strategic_directive_id;
ALTER TABLE feedback DROP COLUMN IF EXISTS duplicate_of_id;

RAISE NOTICE '[ROLLBACK] Migration rolled back successfully';
*/
