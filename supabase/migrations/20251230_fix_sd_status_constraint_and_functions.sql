-- ============================================================================
-- Fix SD Status Constraint and Add Missing Functions
-- ============================================================================
-- Date: 2025-12-30
-- Purpose:
--   1. Add 'planning' and 'review' to status constraint (used by handoff.js)
--   2. Add check_orphaned_work() function (missing, causes update failures)
--   3. Add enforce_orphan_protection() trigger
--
-- Root Cause: handoff.js uses status values not in database constraint
-- Error: "violates check constraint strategic_directives_v2_status_check"
-- Error: "function check_orphaned_work does not exist"
-- ============================================================================

-- ============================================================================
-- STEP 1: Update Status Constraint
-- ============================================================================

-- Drop existing constraint
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_status_check;

-- Add updated constraint with all status values used by LEO Protocol
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_status_check
CHECK (status IN (
  'draft',           -- Initial state
  'active',          -- Approved, being worked on
  'in_progress',     -- Alternative to active
  'planning',        -- LEAD-TO-PLAN completed, in planning phase
  'review',          -- EXEC-TO-PLAN completed, in review phase
  'pending_approval',-- PLAN-TO-LEAD completed, awaiting final approval
  'completed',       -- All work done
  'deferred',        -- Postponed
  'cancelled'        -- Permanently stopped
));

COMMENT ON CONSTRAINT strategic_directives_v2_status_check ON strategic_directives_v2 IS
'Valid SD status values for LEO Protocol v4.3.3. Added planning/review for handoff system.';

-- ============================================================================
-- STEP 2: Add check_orphaned_work() Function
-- ============================================================================

CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id VARCHAR,
  p_from_type VARCHAR(50),
  p_to_type VARCHAR(50)
)
RETURNS JSONB AS $$
DECLARE
  from_profile RECORD;
  to_profile RECORD;
  orphaned_work JSONB := '{"deliverables": [], "user_stories": [], "has_orphans": false}'::jsonb;
  completed_deliverables JSONB;
  validated_stories JSONB;
  sd_legacy_id VARCHAR;
BEGIN
  -- Get validation profiles
  SELECT * INTO from_profile FROM sd_type_validation_profiles WHERE sd_type = p_from_type;
  SELECT * INTO to_profile FROM sd_type_validation_profiles WHERE sd_type = p_to_type;

  -- Get SD legacy ID for user_stories query
  SELECT id INTO sd_legacy_id FROM strategic_directives_v2 WHERE id = p_sd_id;

  -- Check for completed deliverables that would be orphaned
  IF COALESCE(from_profile.requires_deliverables, true) AND NOT COALESCE(to_profile.requires_deliverables, true) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'title', name,
      'status', completion_status,
      'type', category
    ))
    INTO completed_deliverables
    FROM sd_scope_deliverables
    WHERE sd_id = sd_legacy_id
    AND completion_status = 'completed';

    IF completed_deliverables IS NOT NULL AND jsonb_array_length(completed_deliverables) > 0 THEN
      orphaned_work := jsonb_set(orphaned_work, '{deliverables}', completed_deliverables);
      orphaned_work := jsonb_set(orphaned_work, '{has_orphans}', 'true'::jsonb);
    END IF;
  END IF;

  -- Check for validated user stories that would be orphaned
  IF COALESCE(from_profile.requires_user_stories, from_profile.requires_e2e_tests, true)
     AND NOT COALESCE(to_profile.requires_user_stories, to_profile.requires_e2e_tests, true) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'status', status,
      'validation_status', validation_status
    ))
    INTO validated_stories
    FROM user_stories
    WHERE sd_id = sd_legacy_id
    AND (status = 'completed' OR validation_status = 'validated');

    IF validated_stories IS NOT NULL AND jsonb_array_length(validated_stories) > 0 THEN
      orphaned_work := jsonb_set(orphaned_work, '{user_stories}', validated_stories);
      orphaned_work := jsonb_set(orphaned_work, '{has_orphans}', 'true'::jsonb);
    END IF;
  END IF;

  RETURN orphaned_work;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_orphaned_work IS
'Checks if an SD type change would orphan completed deliverables or validated user stories.';

-- ============================================================================
-- STEP 3: Add Orphan Protection Trigger Function
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_orphan_protection()
RETURNS TRIGGER AS $$
DECLARE
  orphan_check JSONB;
  orphaned_deliverables INTEGER;
  orphaned_stories INTEGER;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Check for orphaned work
    orphan_check := check_orphaned_work(NEW.id, OLD.sd_type, NEW.sd_type);

    IF (orphan_check->>'has_orphans')::BOOLEAN THEN
      orphaned_deliverables := COALESCE(jsonb_array_length(orphan_check->'deliverables'), 0);
      orphaned_stories := COALESCE(jsonb_array_length(orphan_check->'user_stories'), 0);

      -- Block if there are orphaned deliverables
      IF orphaned_deliverables > 0 THEN
        RAISE EXCEPTION E'SD_TYPE_CHANGE_ORPHAN_BLOCKED: Type change from "%" to "%" would orphan % completed deliverable(s)',
          OLD.sd_type, NEW.sd_type, orphaned_deliverables;
      END IF;

      -- Block if there are orphaned validated user stories
      IF orphaned_stories > 0 THEN
        RAISE EXCEPTION E'SD_TYPE_CHANGE_ORPHAN_BLOCKED: Type change from "%" to "%" would orphan % validated user stor(y/ies)',
          OLD.sd_type, NEW.sd_type, orphaned_stories;
      END IF;
    END IF;

    -- Store orphan check in governance_metadata for audit
    NEW.governance_metadata := jsonb_set(
      COALESCE(NEW.governance_metadata, '{}'::jsonb),
      '{orphan_check}',
      orphan_check
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_enforce_orphan_protection ON strategic_directives_v2;

CREATE TRIGGER trg_enforce_orphan_protection
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_orphan_protection();

COMMENT ON TRIGGER trg_enforce_orphan_protection ON strategic_directives_v2 IS
'Governance trigger: Blocks SD type changes that would orphan completed deliverables or validated user stories.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  constraint_exists BOOLEAN;
  function_exists BOOLEAN;
  trigger_exists BOOLEAN;
BEGIN
  -- Check constraint
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'strategic_directives_v2_status_check'
  ) INTO constraint_exists;

  -- Check function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'check_orphaned_work'
  ) INTO function_exists;

  -- Check trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_orphan_protection'
  ) INTO trigger_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD Status Constraint and Functions Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Components:';
  RAISE NOTICE '  strategic_directives_v2_status_check: %', CASE WHEN constraint_exists THEN 'UPDATED' ELSE 'MISSING' END;
  RAISE NOTICE '  check_orphaned_work(): %', CASE WHEN function_exists THEN 'CREATED' ELSE 'MISSING' END;
  RAISE NOTICE '  trg_enforce_orphan_protection: %', CASE WHEN trigger_exists THEN 'CREATED' ELSE 'MISSING' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Status values now allowed:';
  RAISE NOTICE '  draft, active, in_progress, planning, review,';
  RAISE NOTICE '  pending_approval, completed, deferred, cancelled';
  RAISE NOTICE '============================================================';
END $$;
