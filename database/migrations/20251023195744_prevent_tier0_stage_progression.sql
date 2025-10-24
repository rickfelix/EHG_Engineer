-- Migration: Prevent Tier 0 ventures from progressing past Stage 3
-- SD-VWC-PHASE1-001: US-002
-- Created: 2025-10-23

-- Function to enforce Tier 0 stage cap at Stage 3
CREATE OR REPLACE FUNCTION prevent_tier0_stage_progression()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if venture is Tier 0 and attempting to progress beyond Stage 3
  IF NEW.tier = 0 AND NEW.current_stage > 3 THEN
    RAISE EXCEPTION 'TIER0_STAGE_CAP: Tier 0 ventures are capped at Stage 3. Upgrade to Tier 1 to continue.'
      USING HINT = 'You must upgrade to Tier 1 (85%% gates) to progress beyond Stage 3.',
            ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on ventures table
DROP TRIGGER IF EXISTS enforce_tier0_stage_cap ON ventures;

CREATE TRIGGER enforce_tier0_stage_cap
  BEFORE INSERT OR UPDATE OF current_stage, tier
  ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tier0_stage_progression();

-- Add comment for documentation
COMMENT ON FUNCTION prevent_tier0_stage_progression() IS
  'Enforces Tier 0 stage cap at Stage 3. Tier 0 ventures must upgrade to Tier 1 to progress beyond Stage 3.
   SD-VWC-PHASE1-001: US-002';

COMMENT ON TRIGGER enforce_tier0_stage_cap ON ventures IS
  'Prevents Tier 0 ventures from progressing past Stage 3. Raises exception with upgrade hint.
   SD-VWC-PHASE1-001: US-002';
