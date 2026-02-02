-- Fix Handoff Schema Drift (PAT-SCHEMA-DRIFT-001)
-- Addresses cosmetic issues where legacy columns remain unpopulated
--
-- Root Cause: Unified handoff system refactor left legacy columns in schema
-- without updating code to populate them, leading to undefined/NULL values.
--
-- This migration fixes existing records and adds guidance for future maintainers.
--
-- Pattern: PAT-SCHEMA-DRIFT-001
-- RCA: SD-LEO-ENH-TARGET-APPLICATION-AWARE-001 (2026-02-02)

BEGIN;

-- ============================================================================
-- PART 1: Fix Existing Records
-- ============================================================================

-- Populate transition_type from handoff_type (they should be the same)
UPDATE sd_phase_handoffs
SET transition_type = handoff_type
WHERE transition_type IS NULL
   OR transition_type = 'undefined'
   OR TRIM(transition_type) = '';

-- Populate session_id with placeholder for audit trail
-- (Session tracking moved to claude_sessions table, but column remains for historical audit)
UPDATE sd_phase_handoffs
SET session_id = 'legacy-unified-handoff-system'
WHERE session_id IS NULL
   OR session_id = 'undefined'
   OR TRIM(session_id) = '';

-- ============================================================================
-- PART 2: Add Comments to Mark Legacy Columns
-- ============================================================================

COMMENT ON COLUMN sd_phase_handoffs.transition_type IS
'LEGACY: Populated from handoff_type for backwards compatibility.
Unified handoff system (2025-10+) uses handoff_type as primary field.
This column maintained for audit trail and legacy query compatibility.
Updated via trigger to match handoff_type.';

COMMENT ON COLUMN sd_phase_handoffs.session_id IS
'LEGACY: Session tracking moved to claude_sessions table with proper FK relationships.
This column maintained for historical audit trail only.
Populated with ''legacy-unified-handoff-system'' for records created by unified system.
Future: Consider FK to claude_sessions.session_id if session tracking in handoffs is needed.';

-- ============================================================================
-- PART 3: Create Trigger to Auto-Populate transition_type
-- ============================================================================

-- Function to ensure transition_type stays in sync with handoff_type
CREATE OR REPLACE FUNCTION sync_handoff_transition_type()
RETURNS TRIGGER AS $$
BEGIN
  -- Always keep transition_type in sync with handoff_type
  NEW.transition_type := NEW.handoff_type;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_sync_handoff_transition_type ON sd_phase_handoffs;

CREATE TRIGGER trg_sync_handoff_transition_type
  BEFORE INSERT OR UPDATE OF handoff_type
  ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION sync_handoff_transition_type();

COMMENT ON FUNCTION sync_handoff_transition_type() IS
'Auto-sync trigger for legacy transition_type column.
Ensures transition_type always matches handoff_type for backwards compatibility.
Added as part of PAT-SCHEMA-DRIFT-001 remediation (2026-02-02).';

-- ============================================================================
-- PART 4: Verification Queries (Commented - Run Manually After Migration)
-- ============================================================================

-- Verify no more undefined/NULL transition_type values
-- SELECT COUNT(*) as undefined_transition_type_count
-- FROM sd_phase_handoffs
-- WHERE transition_type IS NULL
--    OR transition_type = 'undefined'
--    OR TRIM(transition_type) = '';
-- Expected: 0

-- Verify no more undefined/NULL session_id values
-- SELECT COUNT(*) as undefined_session_id_count
-- FROM sd_phase_handoffs
-- WHERE session_id IS NULL
--    OR session_id = 'undefined'
--    OR TRIM(session_id) = '';
-- Expected: 0

-- Verify trigger is working (create test record)
-- INSERT INTO sd_phase_handoffs (
--   sd_id, handoff_type, from_phase, to_phase, status
-- ) VALUES (
--   'TEST-SD-001', 'LEAD-TO-PLAN', 'LEAD', 'PLAN', 'pending'
-- ) RETURNING handoff_type, transition_type;
-- Expected: transition_type should equal handoff_type

-- ============================================================================
-- PART 5: Pattern Documentation
-- ============================================================================

-- Log this migration in issue_patterns for future reference
INSERT INTO issue_patterns (
  pattern_id,
  pattern_name,
  issue_summary,
  root_cause_analysis,
  proven_solutions,
  prevention_checklist,
  severity,
  category,
  occurrences,
  first_seen,
  last_seen,
  related_sub_agents,
  source,
  is_active
) VALUES (
  'PAT-SCHEMA-DRIFT-001',
  'Legacy Schema Columns After Code Refactors',
  'Code refactored to use new patterns but legacy schema columns remain unpopulated',
  'When code is refactored (e.g., unified handoff system), legacy schema columns may stop being populated. Developers change code without updating schema to match, or mark columns as deprecated. Result: NULL/undefined values in production data.',
  ARRAY[
    'Add database comments marking columns as LEGACY',
    'Create triggers to auto-populate legacy columns from new fields',
    'Update existing records with placeholder values',
    'Consider DROP COLUMN for truly unused fields (after backup)'
  ],
  ARRAY[
    'After major code refactors, audit all table schemas for orphaned columns',
    'Add schema validation to CI/CD pipeline',
    'Use database comments to mark deprecated columns',
    'Create triggers to maintain legacy columns automatically',
    'Periodic schema health checks (unused columns, NULL-heavy columns)'
  ],
  'medium',
  'database',
  13,
  '2026-02-02'::timestamp,
  '2026-02-02'::timestamp,
  ARRAY['DATABASE', 'RCA'],
  'retrospective',
  true
) ON CONFLICT (pattern_id) DO UPDATE SET
  occurrences = issue_patterns.occurrences + 1,
  last_seen = EXCLUDED.last_seen,
  proven_solutions = EXCLUDED.proven_solutions,
  prevention_checklist = EXCLUDED.prevention_checklist;

COMMIT;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration complete: Handoff schema drift fixed';
  RAISE NOTICE '   - Updated % records with undefined transition_type',
    (SELECT COUNT(*) FROM sd_phase_handoffs WHERE transition_type = 'legacy-unified-handoff-system');
  RAISE NOTICE '   - Updated % records with undefined session_id',
    (SELECT COUNT(*) FROM sd_phase_handoffs WHERE session_id = 'legacy-unified-handoff-system');
  RAISE NOTICE '   - Added trigger to auto-sync transition_type';
  RAISE NOTICE '   - Documented pattern PAT-SCHEMA-DRIFT-001';
END $$;
