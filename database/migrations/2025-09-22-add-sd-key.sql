-- Add sd_key column to strategic_directives_v2 for Vision Alignment Pipeline compatibility
-- Date: 2025-09-22
-- Purpose: Enable human-readable keys for strategic directives (e.g., SD-2025-09-22-vision-pipeline)
-- Risk: LOW - Purely additive column, no existing functionality affected

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 1. Add sd_key column (nullable initially for backfill compatibility)
ALTER TABLE strategic_directives_v2
    ADD COLUMN IF NOT EXISTS sd_key text UNIQUE;

-- 2. Create helper function for generating URL-safe slugs
-- Note: unaccent extension may not be available in all environments
-- Fall back to basic slug generation if extension fails
CREATE OR REPLACE FUNCTION eng_slugify(txt text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    -- Try with unaccent if available, otherwise use basic approach
    BEGIN
        RETURN regexp_replace(lower(unaccent(coalesce(txt,''))), '[^a-z0-9]+', '-', 'g');
    EXCEPTION WHEN OTHERS THEN
        -- Fallback: basic slug without unaccent
        RETURN regexp_replace(lower(coalesce(txt,'')), '[^a-z0-9]+', '-', 'g');
    END;
END $$;

-- 3. Backfill existing records with deterministic sd_key values
-- Pattern: SD-YYYY-MM-DD-{title-slug} or SD-YYYY-MM-DD-{id-prefix} if no title
UPDATE strategic_directives_v2 sd
SET sd_key = 'SD-' ||
             to_char(COALESCE(sd.effective_date, sd.created_at, now()), 'YYYY-MM-DD') || '-' ||
             CASE
                WHEN sd.title IS NOT NULL AND length(trim(sd.title)) > 0 THEN
                    substring(eng_slugify(sd.title) from 1 for 40)
                ELSE
                    substring(sd.id from 1 for 8)
             END
WHERE sd.sd_key IS NULL;

-- 4. Create index for performance on sd_key lookups
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_sd_key
    ON strategic_directives_v2(sd_key);

-- 5. Add comment for documentation
COMMENT ON COLUMN strategic_directives_v2.sd_key IS
    'Human-readable key for strategic directive (e.g., SD-2025-09-22-vision-pipeline). Used by Vision Alignment Pipeline workflows.';

-- 6. Verify backfill worked
DO $$
DECLARE
    null_count integer;
    total_count integer;
BEGIN
    SELECT count(*) INTO total_count FROM strategic_directives_v2;
    SELECT count(*) INTO null_count FROM strategic_directives_v2 WHERE sd_key IS NULL;

    RAISE NOTICE 'SD Key backfill complete: % total records, % null keys remaining', total_count, null_count;

    IF null_count > 0 THEN
        RAISE WARNING 'Some records still have null sd_key values. Manual review may be needed.';
    END IF;
END $$;

COMMIT;

-- Migration verification
\echo '✅ Migration 2025-09-22-add-sd-key.sql completed successfully'
\echo '📊 Strategic directives now have sd_key column for Vision Alignment Pipeline compatibility'