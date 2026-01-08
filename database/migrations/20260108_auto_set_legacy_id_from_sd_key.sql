-- Migration: Auto-set legacy_id from sd_key
-- Purpose: Prevent confusion between id/sd_key/legacy_id fields
-- When legacy_id is NULL or equals the UUID id, set it to sd_key instead
-- This ensures preflight scripts can find SDs by sd_key via legacy_id lookup

-- Function to auto-populate legacy_id from sd_key
CREATE OR REPLACE FUNCTION auto_set_legacy_id_from_sd_key()
RETURNS TRIGGER AS $$
BEGIN
  -- If legacy_id is NULL, empty, or equals the UUID id (common mistake),
  -- set it to sd_key for lookup compatibility
  IF NEW.legacy_id IS NULL
     OR NEW.legacy_id = ''
     OR NEW.legacy_id = NEW.id::text
  THEN
    NEW.legacy_id := NEW.sd_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trg_auto_set_legacy_id ON strategic_directives_v2;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER trg_auto_set_legacy_id
  BEFORE INSERT OR UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_legacy_id_from_sd_key();

-- Fix existing records where legacy_id equals UUID id
UPDATE strategic_directives_v2
SET legacy_id = sd_key
WHERE legacy_id = id::text
  AND sd_key IS NOT NULL
  AND sd_key != '';

-- Add comment for documentation
COMMENT ON FUNCTION auto_set_legacy_id_from_sd_key() IS
  'LEO Protocol: Auto-sets legacy_id to sd_key when legacy_id is NULL or incorrectly set to UUID.
   This ensures phase-preflight.js can find SDs by sd_key via the legacy_id lookup.
   Created by SD-TECH-DEBT-LEGACY-SD-001 investigation.';
