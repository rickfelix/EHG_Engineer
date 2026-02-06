-- SD Type Change Governance with Anti-Gaming (FIXED)
-- SD-LEO-INFRA-CONTEXT-AWARE-LLM-001D
--
-- This migration adds governance controls for SD type changes:
-- 1. Creates generic audit_log table (prerequisite)
-- 2. Adds type_change_reason column
-- 3. Creates trigger to enforce type change rules
-- 4. Implements gaming detection
-- 5. Logs all type changes to audit_log

-- Step 0: Create generic audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity) WHERE severity IN ('error', 'critical');

COMMENT ON TABLE audit_log IS 'Generic audit log for tracking system events, changes, and governance actions across all LEO Protocol entities.';

-- Step 1: Add type_change_reason column
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS type_change_reason TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN strategic_directives_v2.type_change_reason IS
'Required explanation when sd_type is changed. Used to document why type was corrected and to detect gaming attempts.';

-- Step 2: Create function to get validation threshold for SD type
CREATE OR REPLACE FUNCTION get_sd_type_threshold(p_type TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'feature' THEN 85
    WHEN 'bugfix' THEN 85
    WHEN 'database' THEN 85
    WHEN 'security' THEN 90
    WHEN 'refactor' THEN 80  -- Average of 75-90
    WHEN 'infrastructure' THEN 80
    WHEN 'documentation' THEN 60
    WHEN 'orchestrator' THEN 70
    ELSE 85  -- Default
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Create gaming detection function
CREATE OR REPLACE FUNCTION detect_type_change_gaming(
  p_old_type TEXT,
  p_new_type TEXT,
  p_reason TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_old_threshold INTEGER;
  v_new_threshold INTEGER;
  v_reason_lower TEXT;
BEGIN
  -- Get thresholds
  v_old_threshold := get_sd_type_threshold(p_old_type);
  v_new_threshold := get_sd_type_threshold(p_new_type);

  -- If new threshold is not lower, not gaming
  IF v_new_threshold >= v_old_threshold THEN
    RETURN FALSE;
  END IF;

  -- Check if reason mentions threshold/validation reduction
  v_reason_lower := LOWER(COALESCE(p_reason, ''));

  -- Gaming indicators: mentioning threshold, validation, or reduced requirements
  IF v_reason_lower ~ '(threshold|validation|gate|reduce|easier|bypass|skip|avoid)' THEN
    -- If reason primarily mentions validation benefits, it's gaming
    IF v_reason_lower !~ '(discovered|actually|truly|nature|incorrect|wrong|mistaken|error)' THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 4: Create the main governance trigger function
CREATE OR REPLACE FUNCTION enforce_sd_type_change_governance()
RETURNS TRIGGER AS $$
DECLARE
  v_is_gaming BOOLEAN;
  v_has_bypass BOOLEAN;
  v_old_threshold INTEGER;
  v_new_threshold INTEGER;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS NOT DISTINCT FROM NEW.sd_type THEN
    RETURN NEW;
  END IF;

  -- Check for LEAD override via governance_bypass_reason
  v_has_bypass := NEW.governance_metadata->>'bypass_reason' IS NOT NULL
                  AND LENGTH(TRIM(NEW.governance_metadata->>'bypass_reason')) >= 10;

  -- If LEAD override provided, allow the change and log it
  IF v_has_bypass THEN
    -- Log the override
    INSERT INTO audit_log (
      event_type,
      entity_type,
      entity_id,
      old_value,
      new_value,
      metadata,
      severity,
      created_by
    ) VALUES (
      'sd_type_change_override',
      'strategic_directive',
      NEW.sd_key,
      jsonb_build_object('type', OLD.sd_type, 'threshold', get_sd_type_threshold(OLD.sd_type)),
      jsonb_build_object('type', NEW.sd_type, 'threshold', get_sd_type_threshold(NEW.sd_type)),
      jsonb_build_object(
        'bypass_reason', NEW.governance_metadata->>'bypass_reason',
        'type_change_reason', NEW.type_change_reason,
        'override_approved_by', 'LEAD'
      ),
      'warning',
      COALESCE(NEW.updated_by, 'system')
    );

    RETURN NEW;
  END IF;

  -- Require type_change_reason for any type change
  IF NEW.type_change_reason IS NULL OR TRIM(NEW.type_change_reason) = '' THEN
    RAISE EXCEPTION 'LEO Protocol: SD type change requires type_change_reason. Provide explanation for why type is being corrected from % to %.',
      OLD.sd_type, NEW.sd_type;
  END IF;

  -- Check minimum reason length
  IF LENGTH(TRIM(NEW.type_change_reason)) < 20 THEN
    RAISE EXCEPTION 'LEO Protocol: type_change_reason must be at least 20 characters. Provide meaningful explanation for type correction.';
  END IF;

  -- Check for gaming
  v_is_gaming := detect_type_change_gaming(OLD.sd_type, NEW.sd_type, NEW.type_change_reason);

  IF v_is_gaming THEN
    -- Log the blocked gaming attempt
    INSERT INTO audit_log (
      event_type,
      entity_type,
      entity_id,
      old_value,
      new_value,
      metadata,
      severity,
      created_by
    ) VALUES (
      'sd_type_change_gaming_blocked',
      'strategic_directive',
      NEW.sd_key,
      jsonb_build_object('type', OLD.sd_type, 'threshold', get_sd_type_threshold(OLD.sd_type)),
      jsonb_build_object('type', NEW.sd_type, 'threshold', get_sd_type_threshold(NEW.sd_type)),
      jsonb_build_object(
        'reason_provided', NEW.type_change_reason,
        'gaming_detected', TRUE,
        'threshold_reduction', get_sd_type_threshold(OLD.sd_type) - get_sd_type_threshold(NEW.sd_type)
      ),
      'error',
      COALESCE(NEW.updated_by, 'system')
    );

    RAISE EXCEPTION 'LEO Protocol: Type change blocked - appears to be gaming. Changing from % (threshold %) to % (threshold %) with reason that suggests validation avoidance. Use LEAD override (governance_metadata.bypass_reason) if this is legitimate.',
      OLD.sd_type, get_sd_type_threshold(OLD.sd_type),
      NEW.sd_type, get_sd_type_threshold(NEW.sd_type);
  END IF;

  -- Valid type change - log it
  INSERT INTO audit_log (
    event_type,
    entity_type,
    entity_id,
    old_value,
    new_value,
    metadata,
    severity,
    created_by
  ) VALUES (
    'sd_type_change',
    'strategic_directive',
    NEW.sd_key,
    jsonb_build_object('type', OLD.sd_type, 'threshold', get_sd_type_threshold(OLD.sd_type)),
    jsonb_build_object('type', NEW.sd_type, 'threshold', get_sd_type_threshold(NEW.sd_type)),
    jsonb_build_object(
      'type_change_reason', NEW.type_change_reason,
      'threshold_change', get_sd_type_threshold(NEW.sd_type) - get_sd_type_threshold(OLD.sd_type)
    ),
    'info',
    COALESCE(NEW.updated_by, 'system')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create the trigger (drop if exists first)
DROP TRIGGER IF EXISTS trg_enforce_sd_type_change_governance ON strategic_directives_v2;

CREATE TRIGGER trg_enforce_sd_type_change_governance
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sd_type_change_governance();

-- Step 6: Add index for audit log queries on sd_type_change events
CREATE INDEX IF NOT EXISTS idx_audit_log_sd_type_changes
ON audit_log (entity_id, event_type)
WHERE event_type LIKE 'sd_type_change%';

COMMENT ON FUNCTION enforce_sd_type_change_governance() IS
'LEO Protocol governance trigger for SD type changes. Requires type_change_reason, detects gaming attempts, and logs all changes to audit_log. SD-LEO-INFRA-CONTEXT-AWARE-LLM-001D';

-- Success message
SELECT 'Migration complete: SD type change governance controls activated' AS result;
