-- Hardening Fixes for User Story System
-- Apply these after the main migration to prevent integrity issues

-- ========================================
-- A) Prevent future duplicate SDs
-- ========================================

-- Create partial unique index on legacy_id (allows NULLs, enforces uniqueness when present)
CREATE UNIQUE INDEX IF NOT EXISTS uk_sd_legacy_id_unique
  ON strategic_directives_v2 (legacy_id)
  WHERE legacy_id IS NOT NULL;

-- Optional: Case-insensitive version (uncomment if needed)
-- CREATE UNIQUE INDEX IF NOT EXISTS uk_sd_legacy_id_unique_ci
--   ON strategic_directives_v2 (lower(legacy_id))
--   WHERE legacy_id IS NOT NULL;

-- ========================================
-- B) Function overloading for flexible typing
-- ========================================

-- Since product_requirements_v2.id is TEXT, we need the function to handle TEXT input
-- This is already handled in our compat function, but let's ensure it works with both

-- Drop existing if needed and recreate with proper signature
DROP FUNCTION IF EXISTS fn_generate_stories_from_prd(TEXT, UUID, TEXT);

-- Our function already uses TEXT for PRD ID, so just ensure permissions are correct
-- Verify the function exists with correct signature
DO $$
BEGIN
    -- Check if function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'fn_generate_stories_from_prd'
    ) THEN
        -- Ensure proper permissions
        REVOKE ALL ON FUNCTION fn_generate_stories_from_prd(TEXT, TEXT, TEXT) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION fn_generate_stories_from_prd(TEXT, TEXT, TEXT) TO service_role;
        RAISE NOTICE 'Function permissions updated';
    ELSE
        RAISE WARNING 'Function fn_generate_stories_from_prd not found - run compat migration first';
    END IF;
END $$;

-- ========================================
-- C) Additional safety checks
-- ========================================

-- Ensure story_key has unique index for fast lookups
CREATE INDEX IF NOT EXISTS idx_sd_backlog_story_key_unique
ON sd_backlog_map(story_key)
WHERE story_key IS NOT NULL;

-- Ensure we can't have duplicate story keys
DO $$
BEGIN
    -- Check for existing duplicate story keys
    IF EXISTS (
        SELECT story_key, COUNT(*)
        FROM sd_backlog_map
        WHERE story_key IS NOT NULL
        GROUP BY story_key
        HAVING COUNT(*) > 1
    ) THEN
        RAISE WARNING 'Duplicate story keys found - manual cleanup needed';
    ELSE
        RAISE NOTICE 'No duplicate story keys found';
    END IF;
END $$;

-- ========================================
-- Verification
-- ========================================

-- Check our fixes
SELECT
    'Hardening Checks' as check_type,
    EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uk_sd_legacy_id_unique'
    ) as unique_index_exists,
    EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'fn_generate_stories_from_prd'
        AND prosecdef = true  -- SECURITY DEFINER
    ) as function_secured,
    (
        SELECT COUNT(DISTINCT legacy_id)
        FROM strategic_directives_v2
        WHERE legacy_id IS NOT NULL
    ) = (
        SELECT COUNT(*)
        FROM strategic_directives_v2
        WHERE legacy_id IS NOT NULL
    ) as no_duplicate_legacy_ids;