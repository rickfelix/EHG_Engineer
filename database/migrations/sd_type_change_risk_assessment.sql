-- ============================================================================
-- SD Type Change Risk Assessment
-- ============================================================================
-- SD: SD-LEO-COMPLETION-GATES-001
-- User Story: US-003 - Implement SD Type Change Risk Assessment
-- Priority: HIGH
-- Date: 2025-12-30
--
-- PURPOSE: Prevent SD type changes from being used as validation bypasses
-- EVIDENCE: 57% of P4-P10 reclassifications appeared to bypass requirements
--
-- RISK LEVELS:
--   LOW (0-30): Minor changes, auto-approved
--   MEDIUM (31-60): Moderate changes, logged with warning
--   HIGH (61-80): Significant changes, require Chairman approval
--   CRITICAL (81-100): Blocked automatically
-- ============================================================================

-- ============================================================================
-- TABLE: SD Type Change Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_type_change_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(100) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  sd_legacy_id VARCHAR(100),  -- For reference
  from_type VARCHAR(50) NOT NULL,
  to_type VARCHAR(50) NOT NULL,

  -- Risk Assessment
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level VARCHAR(20) CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_factors JSONB DEFAULT '[]'::jsonb,

  -- Decision
  blocked BOOLEAN DEFAULT false,
  approval_required BOOLEAN DEFAULT false,
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Context
  sd_phase VARCHAR(50),  -- Phase at time of change
  sd_status VARCHAR(50), -- Status at time of change
  user_story_count INTEGER DEFAULT 0,
  deliverable_count INTEGER DEFAULT 0,
  completed_deliverables INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'SYSTEM'
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_sd_type_change_audit_sd_id ON sd_type_change_audit(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_type_change_audit_risk_level ON sd_type_change_audit(risk_level);
CREATE INDEX IF NOT EXISTS idx_sd_type_change_audit_blocked ON sd_type_change_audit(blocked);

COMMENT ON TABLE sd_type_change_audit IS
'Audit log for SD type changes with risk assessment. Part of SD-LEO-COMPLETION-GATES-001 governance enhancement.';

-- ============================================================================
-- FUNCTION: Assess SD Type Change Risk
-- ============================================================================

CREATE OR REPLACE FUNCTION assess_sd_type_change_risk(
  p_sd_id VARCHAR(100),
  p_from_type VARCHAR(50),
  p_to_type VARCHAR(50)
)
RETURNS JSONB AS $$
DECLARE
  risk_score INTEGER := 0;
  risk_factors JSONB := '[]'::jsonb;
  risk_level VARCHAR(20);
  sd RECORD;
  from_profile RECORD;
  to_profile RECORD;
  user_story_count INTEGER;
  deliverable_count INTEGER;
  completed_deliverables INTEGER;
  handoff_count INTEGER;
  requirement_reduction INTEGER := 0;
BEGIN
  -- Get SD details
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = p_sd_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- Get validation profiles
  SELECT * INTO from_profile FROM sd_type_validation_profiles WHERE sd_type = p_from_type;
  SELECT * INTO to_profile FROM sd_type_validation_profiles WHERE sd_type = p_to_type;

  -- Count existing work
  SELECT COUNT(*) INTO user_story_count FROM user_stories WHERE sd_id = sd.id;
  SELECT COUNT(*) INTO deliverable_count FROM sd_scope_deliverables WHERE sd_id = sd.id;
  SELECT COUNT(*) INTO completed_deliverables FROM sd_scope_deliverables
    WHERE sd_id = sd.id AND completion_status = 'completed';
  SELECT COUNT(DISTINCT handoff_type) INTO handoff_count FROM sd_phase_handoffs
    WHERE sd_id = p_sd_id AND status = 'accepted';

  -- ============================================================================
  -- RISK FACTOR 1: Requirement Reduction (0-40 points)
  -- ============================================================================
  -- Downgrading from a type with more requirements to fewer is risky

  -- Check if E2E tests requirement is being dropped
  IF COALESCE(from_profile.requires_e2e_tests, false) AND NOT COALESCE(to_profile.requires_e2e_tests, false) THEN
    risk_score := risk_score + 20;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'E2E Test Requirement Dropped',
      'points', 20,
      'description', 'Changing from type requiring E2E tests to type without E2E requirement'
    );
  END IF;

  -- Check if user story requirement is being dropped
  IF COALESCE(from_profile.requires_user_stories, from_profile.requires_e2e_tests, false)
     AND NOT COALESCE(to_profile.requires_user_stories, to_profile.requires_e2e_tests, false) THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'User Story Requirement Dropped',
      'points', 15,
      'description', 'Changing from type requiring user stories to type without story requirement'
    );
  END IF;

  -- Check if deliverables requirement is being dropped
  IF COALESCE(from_profile.requires_deliverables, false) AND NOT COALESCE(to_profile.requires_deliverables, false) THEN
    risk_score := risk_score + 10;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Deliverables Requirement Dropped',
      'points', 10,
      'description', 'Changing from type requiring deliverables to type without deliverable tracking'
    );
  END IF;

  -- Check if retrospective requirement is being dropped
  IF COALESCE(from_profile.requires_retrospective, false) AND NOT COALESCE(to_profile.requires_retrospective, false) THEN
    risk_score := risk_score + 5;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Retrospective Requirement Dropped',
      'points', 5,
      'description', 'Changing from type requiring retrospective to type without retrospective'
    );
  END IF;

  -- ============================================================================
  -- RISK FACTOR 2: Phase Timing (0-25 points)
  -- ============================================================================
  -- Changes late in the lifecycle are riskier

  IF sd.current_phase = 'EXEC' THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Change During EXEC Phase',
      'points', 15,
      'description', 'SD is currently in EXEC phase - type change may invalidate in-progress work'
    );
  END IF;

  IF sd.current_phase = 'LEAD_FINAL' THEN
    risk_score := risk_score + 25;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Change During Final Approval',
      'points', 25,
      'description', 'SD is in LEAD_FINAL phase - type change at this stage is highly suspicious'
    );
  END IF;

  IF sd.status = 'pending_approval' THEN
    risk_score := risk_score + 10;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Change While Pending Approval',
      'points', 10,
      'description', 'SD is pending approval - type change may be attempt to bypass review'
    );
  END IF;

  -- ============================================================================
  -- RISK FACTOR 3: Existing Work Impact (0-25 points)
  -- ============================================================================
  -- Changes that could orphan existing work are risky

  IF user_story_count > 0 AND NOT COALESCE(to_profile.requires_user_stories, to_profile.requires_e2e_tests, true) THEN
    risk_score := risk_score + (LEAST(user_story_count, 5) * 5); -- Up to 25 points
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'User Stories May Be Orphaned',
      'points', LEAST(user_story_count, 5) * 5,
      'description', format('%s user stories exist but new type does not require stories', user_story_count)
    );
  END IF;

  IF completed_deliverables > 0 AND NOT COALESCE(to_profile.requires_deliverables, true) THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Completed Deliverables May Be Orphaned',
      'points', 15,
      'description', format('%s completed deliverables exist but new type does not track deliverables', completed_deliverables)
    );
  END IF;

  -- ============================================================================
  -- RISK FACTOR 4: Pattern Detection (0-20 points)
  -- ============================================================================
  -- Detect patterns that suggest validation bypass

  -- feature -> infrastructure is a common bypass pattern
  IF p_from_type = 'feature' AND p_to_type = 'infrastructure' THEN
    risk_score := risk_score + 10;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Feature-to-Infrastructure Pattern',
      'points', 10,
      'description', 'Changing from feature to infrastructure - common validation bypass pattern'
    );
  END IF;

  -- feature -> docs is also suspicious if work has been done
  IF p_from_type = 'feature' AND p_to_type = 'docs' AND (user_story_count > 0 OR deliverable_count > 0) THEN
    risk_score := risk_score + 15;
    risk_factors := risk_factors || jsonb_build_object(
      'factor', 'Feature-to-Docs With Existing Work',
      'points', 15,
      'description', 'Changing from feature to docs when user stories or deliverables exist'
    );
  END IF;

  -- Multiple type changes in short period (check audit log)
  DECLARE
    recent_changes INTEGER;
  BEGIN
    SELECT COUNT(*) INTO recent_changes
    FROM sd_type_change_audit
    WHERE sd_id = p_sd_id
    AND created_at > NOW() - INTERVAL '7 days';

    IF recent_changes >= 2 THEN
      risk_score := risk_score + 20;
      risk_factors := risk_factors || jsonb_build_object(
        'factor', 'Multiple Recent Type Changes',
        'points', 20,
        'description', format('%s type changes in last 7 days - pattern suggests gaming the system', recent_changes + 1)
      );
    END IF;
  END;

  -- ============================================================================
  -- DETERMINE RISK LEVEL
  -- ============================================================================
  -- Cap score at 100
  risk_score := LEAST(risk_score, 100);

  IF risk_score <= 30 THEN
    risk_level := 'LOW';
  ELSIF risk_score <= 60 THEN
    risk_level := 'MEDIUM';
  ELSIF risk_score <= 80 THEN
    risk_level := 'HIGH';
  ELSE
    risk_level := 'CRITICAL';
  END IF;

  -- ============================================================================
  -- RETURN ASSESSMENT
  -- ============================================================================
  RETURN jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_legacy_id', sd.id,
    'from_type', p_from_type,
    'to_type', p_to_type,
    'risk_score', risk_score,
    'risk_level', risk_level,
    'risk_factors', risk_factors,
    'blocked', risk_level = 'CRITICAL',
    'approval_required', risk_level = 'HIGH',
    'context', jsonb_build_object(
      'current_phase', sd.current_phase,
      'current_status', sd.status,
      'user_story_count', user_story_count,
      'deliverable_count', deliverable_count,
      'completed_deliverables', completed_deliverables,
      'handoff_count', handoff_count
    ),
    'recommendation', CASE risk_level
      WHEN 'LOW' THEN 'Proceed with type change'
      WHEN 'MEDIUM' THEN 'Review risk factors before proceeding'
      WHEN 'HIGH' THEN 'Requires Chairman approval before proceeding'
      WHEN 'CRITICAL' THEN 'Type change BLOCKED - too risky'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION assess_sd_type_change_risk IS
'Assesses risk of SD type change. Returns risk score (0-100), risk level (LOW/MEDIUM/HIGH/CRITICAL), and detailed factors. CRITICAL changes are blocked, HIGH changes require Chairman approval.';

-- ============================================================================
-- TRIGGER: Enforce Risk Assessment on Type Change
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_sd_type_change_risk()
RETURNS TRIGGER AS $$
DECLARE
  risk_assessment JSONB;
  reclassification_info JSONB;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Perform risk assessment
    risk_assessment := assess_sd_type_change_risk(NEW.id, OLD.sd_type, NEW.sd_type);

    -- Store risk assessment in governance_metadata
    NEW.governance_metadata := jsonb_set(
      COALESCE(NEW.governance_metadata, '{}'::jsonb),
      '{risk_assessment}',
      risk_assessment
    );

    -- Log to audit table
    INSERT INTO sd_type_change_audit (
      sd_id,
      sd_legacy_id,
      from_type,
      to_type,
      risk_score,
      risk_level,
      risk_factors,
      blocked,
      approval_required,
      approved_by,
      sd_phase,
      sd_status,
      user_story_count,
      deliverable_count,
      completed_deliverables,
      created_by
    ) VALUES (
      NEW.id,
      NEW.id,
      OLD.sd_type,
      NEW.sd_type,
      (risk_assessment->>'risk_score')::INTEGER,
      risk_assessment->>'risk_level',
      risk_assessment->'risk_factors',
      (risk_assessment->>'blocked')::BOOLEAN,
      (risk_assessment->>'approval_required')::BOOLEAN,
      NEW.governance_metadata->'type_reclassification'->>'approved_by',
      OLD.current_phase,
      OLD.status,
      (risk_assessment->'context'->>'user_story_count')::INTEGER,
      (risk_assessment->'context'->>'deliverable_count')::INTEGER,
      (risk_assessment->'context'->>'completed_deliverables')::INTEGER,
      COALESCE(NEW.updated_by, 'SYSTEM')
    );

    -- CRITICAL: Block the change
    IF (risk_assessment->>'blocked')::BOOLEAN THEN
      RAISE EXCEPTION E'SD_TYPE_CHANGE_BLOCKED: Type change from "%" to "%" is BLOCKED (CRITICAL risk)\n\nRisk Score: %/100\nRisk Level: CRITICAL\n\nRisk Factors:\n%\n\nThis change cannot proceed. Contact project leadership if you believe this is in error.',
        OLD.sd_type, NEW.sd_type,
        risk_assessment->>'risk_score',
        jsonb_pretty(risk_assessment->'risk_factors');
    END IF;

    -- HIGH: Require Chairman approval
    IF (risk_assessment->>'approval_required')::BOOLEAN THEN
      reclassification_info := NEW.governance_metadata->'type_reclassification';

      -- Check if Chairman has approved
      IF reclassification_info->>'approved_by' IS NULL OR
         reclassification_info->>'approved_by' NOT IN ('Chairman', 'CEO', 'CTO', 'CHAIRMAN', 'LEAD') THEN
        RAISE EXCEPTION E'SD_TYPE_CHANGE_REQUIRES_APPROVAL: Type change from "%" to "%" requires Chairman approval (HIGH risk)\n\nRisk Score: %/100\nRisk Level: HIGH\n\nRisk Factors:\n%\n\nTo proceed, add approved_by: "Chairman" to governance_metadata.type_reclassification:\n\nUPDATE strategic_directives_v2 \nSET sd_type = ''%'',\n    governance_metadata = jsonb_set(\n      COALESCE(governance_metadata, ''{}''::jsonb),\n      ''{type_reclassification}'',\n      ''{\"from\": \"%\", \"to\": \"%\", \"reason\": \"<reason>\", \"approved_by\": \"Chairman\", \"date\": \"%\"}''::jsonb\n    )\nWHERE id = ''%'';',
          OLD.sd_type, NEW.sd_type,
          risk_assessment->>'risk_score',
          jsonb_pretty(risk_assessment->'risk_factors'),
          NEW.sd_type, OLD.sd_type, NEW.sd_type,
          to_char(CURRENT_DATE, 'YYYY-MM-DD'),
          NEW.id;
      END IF;

      -- Update audit record with approval info
      UPDATE sd_type_change_audit
      SET approved_by = reclassification_info->>'approved_by',
          approved_at = NOW()
      WHERE sd_id = NEW.id
      AND created_at = (SELECT MAX(created_at) FROM sd_type_change_audit WHERE sd_id = NEW.id);
    END IF;

    RAISE NOTICE 'SD Type Change Risk Assessment: % (% → %) - Score: %/100, Level: %',
      NEW.id, OLD.sd_type, NEW.sd_type,
      risk_assessment->>'risk_score',
      risk_assessment->>'risk_level';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (runs BEFORE the existing enforce_sd_type_change_explanation trigger)
DROP TRIGGER IF EXISTS trg_enforce_sd_type_change_risk ON strategic_directives_v2;

CREATE TRIGGER trg_enforce_sd_type_change_risk
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sd_type_change_risk();

COMMENT ON TRIGGER trg_enforce_sd_type_change_risk ON strategic_directives_v2 IS
'Governance trigger: Assesses risk of SD type changes, blocks CRITICAL changes, requires Chairman approval for HIGH risk changes.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  trigger_exists BOOLEAN;
  function_exists BOOLEAN;
  table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_sd_type_change_risk'
  ) INTO trigger_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'assess_sd_type_change_risk'
  ) INTO function_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sd_type_change_audit'
  ) INTO table_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-003: SD Type Change Risk Assessment - Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Components Created:';
  RAISE NOTICE '  sd_type_change_audit table: %', CASE WHEN table_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  assess_sd_type_change_risk(): %', CASE WHEN function_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  trg_enforce_sd_type_change_risk: %', CASE WHEN trigger_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Risk Levels:';
  RAISE NOTICE '  LOW (0-30):      Auto-approved, logged for audit';
  RAISE NOTICE '  MEDIUM (31-60):  Warning displayed, proceed with caution';
  RAISE NOTICE '  HIGH (61-80):    Requires Chairman approval';
  RAISE NOTICE '  CRITICAL (81+):  BLOCKED automatically';
  RAISE NOTICE '';
  RAISE NOTICE 'To test: SELECT assess_sd_type_change_risk(''<VARCHAR_ID>'', ''feature'', ''infrastructure'');';
  RAISE NOTICE '============================================================';
END $$;
