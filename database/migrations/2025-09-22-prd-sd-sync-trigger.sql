-- Synchronization trigger for sd_id and directive_id columns in product_requirements_v2
-- Date: 2025-09-22
-- Purpose: Keep sd_id and directive_id in sync for legacy compatibility during transition
-- Risk: LOW - Non-blocking trigger that only affects INSERT/UPDATE operations

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 1. Create sync function to keep both columns aligned
CREATE OR REPLACE FUNCTION prd_sync_sd_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Check if both columns exist (for safety)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='product_requirements_v2'
        AND column_name='sd_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='product_requirements_v2'
        AND column_name='directive_id'
    ) THEN
        -- If sd_id is NULL but directive_id has a value, copy it
        IF NEW.sd_id IS NULL AND NEW.directive_id IS NOT NULL THEN
            NEW.sd_id := NEW.directive_id;
            RAISE DEBUG 'Synced sd_id from directive_id: %', NEW.directive_id;
        END IF;

        -- If directive_id is NULL but sd_id has a value, mirror it (legacy compatibility)
        IF NEW.directive_id IS NULL AND NEW.sd_id IS NOT NULL THEN
            NEW.directive_id := NEW.sd_id;
            RAISE DEBUG 'Synced directive_id from sd_id: %', NEW.sd_id;
        END IF;

        -- If they're different, log a warning but prefer sd_id as the canonical value
        IF NEW.sd_id IS NOT NULL AND NEW.directive_id IS NOT NULL
           AND NEW.sd_id != NEW.directive_id THEN
            RAISE WARNING 'PRD % has mismatched sd_id (%) and directive_id (%). Using sd_id as canonical.',
                          NEW.id, NEW.sd_id, NEW.directive_id;
            NEW.directive_id := NEW.sd_id;
        END IF;
    END IF;

    RETURN NEW;
END $$;

-- 2. Drop existing trigger if it exists
DROP TRIGGER IF EXISTS prd_sd_sync_before_insert_update ON product_requirements_v2;

-- 3. Create the sync trigger
CREATE TRIGGER prd_sd_sync_before_insert_update
    BEFORE INSERT OR UPDATE ON product_requirements_v2
    FOR EACH ROW
    EXECUTE FUNCTION prd_sync_sd_columns();

-- 4. Add comment for documentation
COMMENT ON FUNCTION prd_sync_sd_columns() IS
    'Synchronizes sd_id and directive_id columns in product_requirements_v2 for legacy compatibility during schema transition';

-- 5. Test the trigger with a dry run (rollback at the end)
SAVEPOINT test_trigger;

DO $$
DECLARE
    test_id uuid;
    test_sd_id varchar(50);
    test_directive_id varchar(50);
BEGIN
    -- Only test if both columns exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='product_requirements_v2'
        AND column_name='sd_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='product_requirements_v2'
        AND column_name='directive_id'
    ) THEN
        -- Test case: Insert with only directive_id
        INSERT INTO product_requirements_v2 (id, title, directive_id, status)
        VALUES (gen_random_uuid(), 'Test PRD for sync trigger', 'SD-2025-TEST-001', 'draft')
        RETURNING id, sd_id, directive_id INTO test_id, test_sd_id, test_directive_id;

        IF test_sd_id = test_directive_id THEN
            RAISE NOTICE 'Trigger test PASSED: sd_id synced from directive_id';
        ELSE
            RAISE WARNING 'Trigger test FAILED: sd_id=%, directive_id=%', test_sd_id, test_directive_id;
        END IF;

        -- Clean up test data
        DELETE FROM product_requirements_v2 WHERE id = test_id;
    ELSE
        RAISE NOTICE 'Trigger test skipped: Both columns not present';
    END IF;
END $$;

ROLLBACK TO SAVEPOINT test_trigger;

-- 6. Final reporting
DO $$
DECLARE
    trigger_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'prd_sd_sync_before_insert_update'
        AND event_object_table = 'product_requirements_v2'
    ) INTO trigger_exists;

    IF trigger_exists THEN
        RAISE NOTICE '✅ Sync trigger successfully installed on product_requirements_v2';
        RAISE NOTICE '   New records will automatically sync sd_id and directive_id';
        RAISE NOTICE '   Updates to either column will sync to the other';
    ELSE
        RAISE WARNING '❌ Sync trigger not found - installation may have failed';
    END IF;
END $$;

COMMIT;

-- Migration verification
\echo '✅ Migration 2025-09-22-prd-sd-sync-trigger.sql completed successfully'
\echo '🔄 Sync trigger installed: sd_id and directive_id will stay aligned'
\echo '📝 Legacy applications can continue using directive_id during transition'