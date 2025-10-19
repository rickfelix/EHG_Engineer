-- ============================================================================
-- Migration: Cleanup Deprecated 'prds' Table
-- Date: 2025-10-16
-- Purpose: Consolidate to single PRD table (product_requirements_v2)
-- ============================================================================
--
-- ANALYSIS SUMMARY:
-- - prds table: 9 records, 12 columns (legacy schema)
-- - product_requirements_v2: 149 records, 50 columns (current/active schema)
-- - 6 records in prds NOT in product_requirements_v2 (need migration)
-- - 30 code references to prds table (need update)
-- - 271 code references to product_requirements_v2 (active/preferred)
-- - 6 foreign keys point TO product_requirements_v2 (safe to keep)
-- - 0 foreign keys point TO prds (safe to drop)
--
-- DECISION:
-- ✅ KEEP: product_requirements_v2 (active, has FKs, comprehensive schema)
-- ❌ DROP: prds (deprecated, minimal schema, superseded)
--
-- ============================================================================

-- STEP 1: Migrate orphaned data from prds to product_requirements_v2
-- ============================================================================

DO $$
DECLARE
    orphan_record RECORD;
    migrated_count INT := 0;
BEGIN
    -- Loop through records in prds that don't exist in product_requirements_v2
    FOR orphan_record IN
        SELECT p.*
        FROM prds p
        LEFT JOIN product_requirements_v2 pr ON p.id = pr.id
        WHERE pr.id IS NULL
    LOOP
        -- Insert into product_requirements_v2 with mapped fields
        INSERT INTO product_requirements_v2 (
            id,
            directive_id,
            sd_id,
            title,
            status,
            content,
            metadata,
            created_at,
            updated_at,
            phase,
            category,
            priority,
            progress
        ) VALUES (
            orphan_record.id,
            orphan_record.strategic_directive_id,
            orphan_record.strategic_directive_id,
            orphan_record.title,
            orphan_record.status,
            orphan_record.content,
            orphan_record.metadata,
            orphan_record.created_at,
            orphan_record.updated_at,
            CASE
                WHEN orphan_record.status = 'approved' THEN 'execution'
                WHEN orphan_record.status = 'active' THEN 'planning'
                ELSE 'planning'
            END,
            'technical', -- default category
            'medium',    -- default priority
            CASE
                WHEN orphan_record.status = 'approved' THEN 50
                WHEN orphan_record.status = 'active' THEN 25
                ELSE 0
            END
        )
        ON CONFLICT (id) DO NOTHING;

        migrated_count := migrated_count + 1;
    END LOOP;

    RAISE NOTICE 'Migrated % orphaned records from prds to product_requirements_v2', migrated_count;
END $$;

-- STEP 2: Verify migration (no orphans remain)
-- ============================================================================

DO $$
DECLARE
    orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM prds p
    LEFT JOIN product_requirements_v2 pr ON p.id = pr.id
    WHERE pr.id IS NULL;

    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Migration incomplete: % orphaned records remain', orphan_count;
    END IF;

    RAISE NOTICE '✅ Migration verified: All records migrated successfully';
END $$;

-- STEP 3: Create backup of prds table (safety)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prds_backup_20251016 AS
SELECT * FROM prds;

COMMENT ON TABLE prds_backup_20251016 IS 'Backup of deprecated prds table before deletion (2025-10-16)';

-- STEP 4: Drop deprecated prds table
-- ============================================================================

DROP TABLE IF EXISTS prds CASCADE;

-- STEP 5: Verification queries
-- ============================================================================

-- Verify product_requirements_v2 has all expected records
DO $$
DECLARE
    prd_count INT;
BEGIN
    SELECT COUNT(*) INTO prd_count FROM product_requirements_v2;
    RAISE NOTICE '✅ product_requirements_v2 record count: %', prd_count;

    IF prd_count < 149 THEN
        RAISE WARNING 'Expected at least 149 records (original count), found %', prd_count;
    END IF;
END $$;

-- ============================================================================
-- POST-MIGRATION TASKS (Manual - to be done after this migration)
-- ============================================================================
--
-- 1. Update code references (30 files) from 'prds' to 'product_requirements_v2':
--    - ./lib/agents/plan-verification-tool.js
--    - ./pages/api/leo/gate-scores.ts
--    - ./pages/api/leo/metrics.ts
--    - ./pages/api/leo/sub-agent-reports.ts
--    - ./scripts/apply-gap-remediation.js
--    - ./scripts/apply-remediation-polish.js
--    - ./scripts/check-sd-051-status.js
--    - ./scripts/create-prd-retro-enhance-001.js
--    - ./scripts/create-prd-sd-047a-v2.js
--    - ./scripts/create-prd-sd-047a.js
--    - ./scripts/create-prd-sd-047b.js
--    - ./scripts/create-prd-sd-backend-001.js
--    - ./scripts/create-prd-sd-uat-020.js
--    - ./scripts/design-ui-ux-audit.js
--    - ./scripts/generate-comprehensive-retrospective.js
--    - ./scripts/generate-retrospective.js
--    - ./scripts/lead-approval-checklist.js
--    - ./scripts/update-prd-fields.js
--    - ./src/services/database-loader/index.ts
--    - ./tools/gates/lib/rules.ts
--    - ./tools/migrations/prd-filesystem-to-database.ts
--    - ./tools/subagents/scan.ts
--    - ./tools/validators/exec-checklist.ts
--
-- 2. Test all affected scripts after code update
--
-- 3. Run E2E tests to verify no regressions
--
-- 4. Drop backup table after 30 days if no issues:
--    DROP TABLE prds_backup_20251016;
--
-- ============================================================================

-- Final status
SELECT
    'prds' as deprecated_table,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'prds') as still_exists,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'prds_backup_20251016') as backup_exists,
    (SELECT COUNT(*) FROM product_requirements_v2) as active_table_count;
