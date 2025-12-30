-- ============================================================================
-- SD Orphan Protection
-- ============================================================================
-- SD: SD-LEO-COMPLETION-GATES-001
-- User Story: US-004 - Implement Orphan Protection for Completed Work
-- Priority: HIGH
-- Date: 2025-12-30
--
-- PURPOSE: Block SD type changes that would orphan completed deliverables or
-- validated user stories. Prevents "throw away the work" anti-pattern.
-- ============================================================================

-- ============================================================================
-- FUNCTION: Check for Orphaned Work
-- ============================================================================

CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id UUID,
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
-- TRIGGER: Enforce Orphan Protection
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
        RAISE EXCEPTION E'SD_TYPE_CHANGE_ORPHAN_BLOCKED: Type change from "%" to "%" would orphan % completed deliverable(s)\n\nOrphaned Deliverables:\n%\n\nThese deliverables have status=''completed'' but the new SD type does not track deliverables.\n\nTo proceed:\n1. Either keep the current SD type\n2. Or mark these deliverables as ''cancelled'' before changing type\n3. Or reconsider if this type change is appropriate',
          OLD.sd_type, NEW.sd_type,
          orphaned_deliverables,
          jsonb_pretty(orphan_check->'deliverables');
      END IF;

      -- Block if there are orphaned validated user stories
      IF orphaned_stories > 0 THEN
        RAISE EXCEPTION E'SD_TYPE_CHANGE_ORPHAN_BLOCKED: Type change from "%" to "%" would orphan % validated user stor(y/ies)\n\nOrphaned User Stories:\n%\n\nThese user stories have been validated but the new SD type does not require stories.\n\nTo proceed:\n1. Either keep the current SD type\n2. Or move these stories to a different SD\n3. Or reconsider if this type change is appropriate',
          OLD.sd_type, NEW.sd_type,
          orphaned_stories,
          jsonb_pretty(orphan_check->'user_stories');
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

-- Create trigger (runs AFTER risk assessment but BEFORE explanation check)
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
  trigger_exists BOOLEAN;
  function_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_orphan_protection'
  ) INTO trigger_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'check_orphaned_work'
  ) INTO function_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-004: Orphan Protection - Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Components Created:';
  RAISE NOTICE '  check_orphaned_work(): %', CASE WHEN function_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  trg_enforce_orphan_protection: %', CASE WHEN trigger_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Protection Rules:';
  RAISE NOTICE '  1. Blocks type changes that orphan completed deliverables';
  RAISE NOTICE '  2. Blocks type changes that orphan validated user stories';
  RAISE NOTICE '  3. Stores orphan check results in governance_metadata';
  RAISE NOTICE '';
  RAISE NOTICE 'To test: SELECT check_orphaned_work(''<UUID>'', ''feature'', ''docs'');';
  RAISE NOTICE '============================================================';
END $$;
