-- Migration: Fix Completed SD Phase Alignment
-- Date: 2025-12-31
-- Issue: 26 SDs have status='completed' but current_phase not set to 'COMPLETED'
-- This causes them to appear as "pending" in sd:next and other queries

-- ============================================================================
-- PRE-MIGRATION: Capture affected records for audit
-- ============================================================================

-- Create audit table to track what we're changing
CREATE TABLE IF NOT EXISTS _migration_audit_027_sd_phase_fix (
    sd_id TEXT PRIMARY KEY,
    title TEXT,
    old_phase TEXT,
    old_status TEXT,
    old_is_working_on BOOLEAN,
    fixed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Record all SDs that will be fixed
INSERT INTO _migration_audit_027_sd_phase_fix (sd_id, title, old_phase, old_status, old_is_working_on)
SELECT
    id,
    title,
    current_phase,
    status,
    is_working_on
FROM strategic_directives_v2
WHERE status = 'completed'
  AND current_phase != 'COMPLETED'
ON CONFLICT (sd_id) DO NOTHING;

-- ============================================================================
-- MIGRATION: Fix phase alignment
-- ============================================================================

-- Step 1: Fix case sensitivity issues (complete/COMPLETE -> COMPLETED)
UPDATE strategic_directives_v2
SET
    current_phase = 'COMPLETED',
    is_working_on = false,
    updated_at = NOW()
WHERE status = 'completed'
  AND current_phase IN ('complete', 'COMPLETE');

-- Step 2: Fix all completed SDs stuck in wrong phases
UPDATE strategic_directives_v2
SET
    current_phase = 'COMPLETED',
    is_working_on = false,
    updated_at = NOW()
WHERE status = 'completed'
  AND current_phase NOT IN ('COMPLETED', 'complete', 'COMPLETE');

-- ============================================================================
-- VERIFICATION: Confirm fix
-- ============================================================================

-- This should return 0 rows after migration
DO $$
DECLARE
    mismatch_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO mismatch_count
    FROM strategic_directives_v2
    WHERE status = 'completed'
      AND current_phase != 'COMPLETED';

    IF mismatch_count > 0 THEN
        RAISE WARNING 'Migration incomplete: % SDs still have status/phase mismatch', mismatch_count;
    ELSE
        RAISE NOTICE 'Migration successful: All completed SDs now have current_phase=COMPLETED';
    END IF;
END $$;

-- ============================================================================
-- OPTIONAL: Create preventive trigger to avoid future mismatches
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_completed_phase_alignment()
RETURNS TRIGGER AS $$
BEGIN
    -- When status is set to 'completed', ensure phase is 'COMPLETED'
    IF NEW.status = 'completed' AND NEW.current_phase != 'COMPLETED' THEN
        NEW.current_phase := 'COMPLETED';
        NEW.is_working_on := false;
        RAISE NOTICE 'Auto-aligned current_phase to COMPLETED for SD: %', NEW.id;
    END IF;

    -- When phase is set to 'COMPLETED', ensure status is 'completed'
    IF NEW.current_phase = 'COMPLETED' AND NEW.status != 'completed' THEN
        NEW.status := 'completed';
        NEW.is_working_on := false;
        RAISE NOTICE 'Auto-aligned status to completed for SD: %', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS tr_enforce_completed_alignment ON strategic_directives_v2;

CREATE TRIGGER tr_enforce_completed_alignment
BEFORE INSERT OR UPDATE ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION enforce_completed_phase_alignment();

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- Show what was fixed
SELECT
    'Fixed SDs' as category,
    COUNT(*) as count
FROM _migration_audit_027_sd_phase_fix;
