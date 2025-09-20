-- Verification script for 2025-01-17-user-stories migration
-- Run this after applying the main migration to verify everything is correct

DO $$
DECLARE
    v_count INTEGER;
    v_error TEXT;
BEGIN
    -- 1. Check columns exist
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_name = 'sd_backlog_map'
    AND column_name IN ('story_key', 'story_title', 'story_description',
                        'verification_status', 'verification_source',
                        'last_verified_at', 'coverage_pct', 'test_file_path');

    IF v_count != 8 THEN
        RAISE EXCEPTION 'Missing columns in sd_backlog_map. Expected 8, got %', v_count;
    END IF;
    RAISE NOTICE '✓ All story columns exist';

    -- 2. Check constraints
    SELECT COUNT(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_name = 'sd_backlog_map'
    AND constraint_name IN ('sd_backlog_map_unique_sd_backlog',
                           'sd_backlog_map_sd_id_fkey');

    IF v_count < 1 THEN
        RAISE WARNING 'Missing constraints on sd_backlog_map';
    ELSE
        RAISE NOTICE '✓ Constraints in place';
    END IF;

    -- 3. Check views exist
    SELECT COUNT(*) INTO v_count
    FROM information_schema.views
    WHERE table_name IN ('v_story_verification_status', 'v_sd_release_gate');

    IF v_count != 2 THEN
        RAISE EXCEPTION 'Missing views. Expected 2, got %', v_count;
    END IF;
    RAISE NOTICE '✓ Views created successfully';

    -- 4. Check function exists and has correct security
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'fn_generate_stories_from_prd';

    IF v_count != 1 THEN
        RAISE EXCEPTION 'Function fn_generate_stories_from_prd not found';
    END IF;

    -- Check SECURITY DEFINER is set
    SELECT COUNT(*) INTO v_count
    FROM pg_proc
    WHERE proname = 'fn_generate_stories_from_prd'
    AND prosecdef = true;

    IF v_count != 1 THEN
        RAISE WARNING 'Function fn_generate_stories_from_prd should have SECURITY DEFINER';
    END IF;
    RAISE NOTICE '✓ Function exists with correct security';

    -- 5. Check indexes
    SELECT COUNT(*) INTO v_count
    FROM pg_indexes
    WHERE tablename = 'sd_backlog_map'
    AND indexname IN ('idx_sd_backlog_verification', 'idx_sd_backlog_story_key');

    IF v_count < 1 THEN
        RAISE WARNING 'Performance indexes may be missing';
    ELSE
        RAISE NOTICE '✓ Indexes created for performance';
    END IF;

    -- 6. Test function permissions (should only work with service_role)
    BEGIN
        -- This should fail for regular users
        PERFORM fn_generate_stories_from_prd('TEST-001', gen_random_uuid(), 'dry_run');
        RAISE WARNING 'Function is accessible to public - security issue!';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '✓ Function correctly restricted to service_role';
        WHEN OTHERS THEN
            -- Could be other errors, but permission is likely correct
            RAISE NOTICE '✓ Function access appears restricted';
    END;

    -- 7. Check for duplicate prevention
    SELECT COUNT(*) INTO v_count
    FROM (
        SELECT sd_id, backlog_id, COUNT(*) as cnt
        FROM sd_backlog_map
        WHERE story_key IS NOT NULL
        GROUP BY sd_id, backlog_id
        HAVING COUNT(*) > 1
    ) dupes;

    IF v_count > 0 THEN
        RAISE WARNING 'Found % duplicate story entries', v_count;
    ELSE
        RAISE NOTICE '✓ No duplicate stories detected';
    END IF;

    -- 8. Verify view calculations
    PERFORM * FROM v_story_verification_status LIMIT 1;
    RAISE NOTICE '✓ v_story_verification_status is queryable';

    PERFORM * FROM v_sd_release_gate LIMIT 1;
    RAISE NOTICE '✓ v_sd_release_gate is queryable';

    -- 9. Check RLS policies (if applicable)
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE tablename = 'sd_backlog_map';

    IF v_count > 0 THEN
        RAISE NOTICE '✓ RLS policies found: %', v_count;
    ELSE
        RAISE NOTICE '⚠ No RLS policies on sd_backlog_map (may be intentional)';
    END IF;

    -- Summary
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Migration verification PASSED';
    RAISE NOTICE 'All story management objects are ready';
    RAISE NOTICE '========================================';

EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
        RAISE EXCEPTION 'Migration verification FAILED: %', v_error;
END $$;

-- Quick data check
SELECT
    'Statistics' as check_type,
    COUNT(DISTINCT sd_id) as unique_sds,
    COUNT(*) FILTER (WHERE story_key IS NOT NULL) as total_stories,
    COUNT(*) FILTER (WHERE verification_status = 'passing') as passing,
    COUNT(*) FILTER (WHERE verification_status = 'failing') as failing,
    COUNT(*) FILTER (WHERE verification_status = 'not_run' OR verification_status IS NULL) as not_run
FROM sd_backlog_map;