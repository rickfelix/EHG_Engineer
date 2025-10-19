-- Fix sd_key to automatically default to id value
-- This prevents the recurring issue where sd_key must be manually set

-- Option 1: Add DEFAULT constraint (preferred for new inserts)
ALTER TABLE strategic_directives_v2
  ALTER COLUMN sd_key SET DEFAULT id;

-- Option 2: Create trigger to auto-populate sd_key from id (more robust)
CREATE OR REPLACE FUNCTION auto_populate_sd_key()
RETURNS TRIGGER AS $$
BEGIN
    -- If sd_key is NULL, set it to the id value
    IF NEW.sd_key IS NULL THEN
        NEW.sd_key := NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_auto_populate_sd_key ON strategic_directives_v2;

-- Create trigger that fires BEFORE INSERT
CREATE TRIGGER trigger_auto_populate_sd_key
    BEFORE INSERT ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION auto_populate_sd_key();

-- Backfill existing rows where sd_key is NULL (if any)
UPDATE strategic_directives_v2
SET sd_key = id
WHERE sd_key IS NULL;

-- Add comment
COMMENT ON TRIGGER trigger_auto_populate_sd_key ON strategic_directives_v2 IS
'Automatically sets sd_key to match id when sd_key is NULL during INSERT operations. Prevents recurring manual setting requirement.';
