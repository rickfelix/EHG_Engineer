-- Migration: Enforce is_working_on before handoff inserts
-- Date: 2026-02-13
-- Purpose: Database-level safety net preventing handoff inserts when SD has is_working_on=false
-- Related: SD-EVA-FEAT-TEMPLATES-LAUNCH-001 incident (code merged without workflow tracking)

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION enforce_is_working_on_for_handoffs()
RETURNS TRIGGER AS $$
DECLARE
  v_is_working_on BOOLEAN;
  v_sd_title TEXT;
  v_bypass_value TEXT;
BEGIN
  -- Check session variable bypass (for admin scripts)
  BEGIN
    v_bypass_value := current_setting('leo.bypass_working_on_check', true);
    IF v_bypass_value = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Setting doesn't exist, continue with check
  END;

  -- Allow system-generated records to bypass
  IF NEW.created_by IN (
    'SYSTEM_MIGRATION',
    'ADMIN_OVERRIDE',
    'ORCHESTRATOR_GUARDIAN',
    'bypass_script',
    'SYSTEM_AUTO_COMPLETE'
  ) THEN
    RETURN NEW;
  END IF;

  -- Allow failure/rejection documentation without claim
  IF NEW.status IN ('rejected', 'error') THEN
    RETURN NEW;
  END IF;

  -- Look up is_working_on for the SD
  SELECT is_working_on, title
  INTO v_is_working_on, v_sd_title
  FROM strategic_directives_v2
  WHERE id = NEW.sd_id;

  -- SD not found — let the FK constraint handle it
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Enforce: is_working_on must be true
  IF v_is_working_on IS NOT TRUE THEN
    RAISE EXCEPTION
      E'LEO Protocol Violation: Cannot create handoff for SD without active session claim\n\n'
      'SD: % (%)\n'
      'Handoff: %\n'
      'is_working_on: %\n\n'
      'ACTION REQUIRED:\n'
      '1. Claim the SD first: npm run sd:start %\n'
      '2. Or use created_by=''ADMIN_OVERRIDE'' for administrative operations\n'
      '3. Or SET LOCAL leo.bypass_working_on_check = ''true'' in a transaction',
      NEW.sd_id, COALESCE(v_sd_title, 'Unknown'),
      NEW.handoff_type,
      COALESCE(v_is_working_on::text, 'NULL'),
      NEW.sd_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create the trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS trg_enforce_is_working_on_handoffs ON sd_phase_handoffs;

CREATE TRIGGER trg_enforce_is_working_on_handoffs
  BEFORE INSERT ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_is_working_on_for_handoffs();

-- Step 3: Add comment for discoverability
COMMENT ON FUNCTION enforce_is_working_on_for_handoffs() IS
  'Blocks handoff inserts when SD is_working_on=false. Bypassed by ADMIN_OVERRIDE, SYSTEM_MIGRATION, ORCHESTRATOR_GUARDIAN, bypass_script, SYSTEM_AUTO_COMPLETE created_by values, rejected/error status, or SET LOCAL leo.bypass_working_on_check=true.';
