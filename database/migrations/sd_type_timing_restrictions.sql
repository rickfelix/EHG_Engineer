-- ============================================================================
-- SD Type Change Timing Restrictions
-- ============================================================================
-- SD: SD-LEO-COMPLETION-GATES-001
-- User Story: US-005 - Add Phase-Based Timing Restrictions
-- Priority: MEDIUM
-- Date: 2025-12-30
--
-- PURPOSE: Prevent SD type changes at inappropriate times in the lifecycle
-- RULES:
--   1. Cannot change type after EXEC phase started (exception: upgrades)
--   2. Cannot change type within 24 hours of completion
--   3. Upgrades (adding requirements) are always allowed
-- ============================================================================

-- ============================================================================
-- FUNCTION: Check if type change is an upgrade
-- ============================================================================

CREATE OR REPLACE FUNCTION is_type_upgrade(
  p_from_type VARCHAR(50),
  p_to_type VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
  from_profile RECORD;
  to_profile RECORD;
  from_requirements INTEGER := 0;
  to_requirements INTEGER := 0;
BEGIN
  SELECT * INTO from_profile FROM sd_type_validation_profiles WHERE sd_type = p_from_type;
  SELECT * INTO to_profile FROM sd_type_validation_profiles WHERE sd_type = p_to_type;

  -- Count requirements for from_type
  IF COALESCE(from_profile.requires_prd, false) THEN from_requirements := from_requirements + 1; END IF;
  IF COALESCE(from_profile.requires_deliverables, false) THEN from_requirements := from_requirements + 1; END IF;
  IF COALESCE(from_profile.requires_e2e_tests, false) THEN from_requirements := from_requirements + 1; END IF;
  IF COALESCE(from_profile.requires_retrospective, false) THEN from_requirements := from_requirements + 1; END IF;
  IF COALESCE(from_profile.requires_sub_agents, false) THEN from_requirements := from_requirements + 1; END IF;

  -- Count requirements for to_type
  IF COALESCE(to_profile.requires_prd, false) THEN to_requirements := to_requirements + 1; END IF;
  IF COALESCE(to_profile.requires_deliverables, false) THEN to_requirements := to_requirements + 1; END IF;
  IF COALESCE(to_profile.requires_e2e_tests, false) THEN to_requirements := to_requirements + 1; END IF;
  IF COALESCE(to_profile.requires_retrospective, false) THEN to_requirements := to_requirements + 1; END IF;
  IF COALESCE(to_profile.requires_sub_agents, false) THEN to_requirements := to_requirements + 1; END IF;

  -- Upgrade means adding requirements (to > from)
  RETURN to_requirements > from_requirements;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_type_upgrade IS
'Returns true if changing from p_from_type to p_to_type adds validation requirements (an upgrade).';

-- ============================================================================
-- TRIGGER: Enforce Timing Restrictions
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_type_change_timing()
RETURNS TRIGGER AS $$
DECLARE
  is_upgrade BOOLEAN;
  time_since_completion INTERVAL;
  reclassification_info JSONB;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Check if this is an upgrade (adding requirements)
    is_upgrade := is_type_upgrade(OLD.sd_type, NEW.sd_type);

    -- RULE 1: Cannot change type after EXEC phase started (exception: upgrades)
    IF OLD.current_phase IN ('EXEC', 'LEAD_FINAL') AND NOT is_upgrade THEN
      reclassification_info := NEW.governance_metadata->'type_reclassification';

      -- Allow if explicitly approved by Chairman for late changes
      IF reclassification_info->>'approved_by' NOT IN ('Chairman', 'CEO', 'CTO', 'CHAIRMAN') THEN
        RAISE EXCEPTION E'SD_TYPE_CHANGE_TIMING_BLOCKED: Cannot change SD type during/after EXEC phase\n\nCurrent Phase: %\nFrom Type: %\nTo Type: %\n\nReason: Type changes after EXEC phase has started could invalidate in-progress work.\n\nExceptions:\n1. Type UPGRADES (adding requirements) are always allowed\n2. Chairman approval can override this restriction\n\nTo proceed with Chairman approval:\nUPDATE strategic_directives_v2 \nSET sd_type = ''%'',\n    governance_metadata = jsonb_set(\n      COALESCE(governance_metadata, ''{}''::jsonb),\n      ''{type_reclassification}'',\n      ''{\"from\": \"%\", \"to\": \"%\", \"reason\": \"<reason>\", \"approved_by\": \"Chairman\"}''::jsonb\n    )\nWHERE id = ''%'';',
          OLD.current_phase, OLD.sd_type, NEW.sd_type,
          NEW.sd_type, OLD.sd_type, NEW.sd_type, NEW.id;
      END IF;
    END IF;

    -- RULE 2: Cannot change type within 24 hours of completion
    IF OLD.status = 'completed' THEN
      time_since_completion := NOW() - COALESCE(OLD.completed_at, OLD.updated_at);

      IF time_since_completion < INTERVAL '24 hours' THEN
        RAISE EXCEPTION E'SD_TYPE_CHANGE_TIMING_BLOCKED: Cannot change SD type within 24 hours of completion\n\nSD Status: completed\nCompleted At: %\nTime Since Completion: %\nRequired Wait: 24 hours\n\nReason: Type changes immediately after completion suggest gaming the system.\n\nPlease wait until % before changing the SD type.',
          COALESCE(OLD.completed_at, OLD.updated_at),
          time_since_completion,
          COALESCE(OLD.completed_at, OLD.updated_at) + INTERVAL '24 hours';
      END IF;
    END IF;

    -- Log the timing check result
    NEW.governance_metadata := jsonb_set(
      COALESCE(NEW.governance_metadata, '{}'::jsonb),
      '{timing_check}',
      jsonb_build_object(
        'checked_at', NOW(),
        'current_phase', OLD.current_phase,
        'is_upgrade', is_upgrade,
        'timing_allowed', true
      )
    );

    IF is_upgrade THEN
      RAISE NOTICE 'SD Type Change: % → % (UPGRADE - always allowed)', OLD.sd_type, NEW.sd_type;
    ELSE
      RAISE NOTICE 'SD Type Change: % → % (timing check passed)', OLD.sd_type, NEW.sd_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (runs first to check timing before other checks)
DROP TRIGGER IF EXISTS trg_enforce_type_change_timing ON strategic_directives_v2;

CREATE TRIGGER trg_enforce_type_change_timing
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_type_change_timing();

COMMENT ON TRIGGER trg_enforce_type_change_timing ON strategic_directives_v2 IS
'Governance trigger: Enforces timing restrictions on SD type changes. Blocks changes after EXEC phase (except upgrades) and within 24 hours of completion.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  trigger_exists BOOLEAN;
  upgrade_fn_exists BOOLEAN;
  timing_fn_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_type_change_timing'
  ) INTO trigger_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_type_upgrade'
  ) INTO upgrade_fn_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enforce_type_change_timing'
  ) INTO timing_fn_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-005: Timing Restrictions - Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Components Created:';
  RAISE NOTICE '  is_type_upgrade(): %', CASE WHEN upgrade_fn_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  enforce_type_change_timing(): %', CASE WHEN timing_fn_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  trg_enforce_type_change_timing: %', CASE WHEN trigger_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Timing Rules:';
  RAISE NOTICE '  1. Block type changes after EXEC phase (except upgrades)';
  RAISE NOTICE '  2. Block type changes within 24 hours of completion';
  RAISE NOTICE '  3. Upgrades (adding requirements) are always allowed';
  RAISE NOTICE '';
  RAISE NOTICE 'To test: SELECT is_type_upgrade(''docs'', ''feature'');';
  RAISE NOTICE '============================================================';
END $$;
