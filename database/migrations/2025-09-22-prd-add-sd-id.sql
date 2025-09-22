-- Add sd_id column to product_requirements_v2 for unified schema compatibility
-- Date: 2025-09-22
-- Purpose: Align PRD table with Vision/WSJF pipeline expectations while preserving legacy directive_id
-- Risk: LOW - Purely additive with automatic backfill from existing directive_id

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 1. Add sd_id column (nullable initially for backfill)
ALTER TABLE product_requirements_v2
    ADD COLUMN IF NOT EXISTS sd_id varchar(50);

-- 2. Backfill from legacy directive_id column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='product_requirements_v2'
        AND column_name='directive_id'
    ) THEN
        -- Update rows where sd_id is NULL but directive_id exists
        UPDATE product_requirements_v2
        SET sd_id = directive_id
        WHERE sd_id IS NULL AND directive_id IS NOT NULL;

        RAISE NOTICE 'Backfilled sd_id from directive_id for % rows',
                     (SELECT count(*) FROM product_requirements_v2
                      WHERE directive_id IS NOT NULL);
    ELSE
        RAISE NOTICE 'No directive_id column found - sd_id column added but not backfilled';
    END IF;
END $$;

-- 3. Add foreign key constraint to strategic_directives_v2
-- Note: We check if the FK already exists to avoid errors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'prd_sd_fk'
        AND table_name = 'product_requirements_v2'
    ) THEN
        ALTER TABLE product_requirements_v2
        ADD CONSTRAINT prd_sd_fk
        FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
        ON UPDATE CASCADE ON DELETE SET NULL;

        RAISE NOTICE 'Added foreign key constraint prd_sd_fk';
    ELSE
        RAISE NOTICE 'Foreign key constraint prd_sd_fk already exists';
    END IF;
END $$;

-- 4. Create index for performance
CREATE INDEX IF NOT EXISTS idx_product_requirements_v2_sd_id
    ON product_requirements_v2(sd_id);

-- 5. Add comment for documentation
COMMENT ON COLUMN product_requirements_v2.sd_id IS
    'Strategic directive ID - unified column for pipeline compatibility. Mirrors directive_id for legacy support.';

-- 6. Verification and reporting
DO $$
DECLARE
    total_prds integer;
    prds_with_sd integer;
    prds_with_directive integer;
    prds_aligned integer;
BEGIN
    SELECT count(*) INTO total_prds FROM product_requirements_v2;
    SELECT count(*) INTO prds_with_sd FROM product_requirements_v2 WHERE sd_id IS NOT NULL;

    -- Check if directive_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='product_requirements_v2'
        AND column_name='directive_id'
    ) THEN
        SELECT count(*) INTO prds_with_directive
        FROM product_requirements_v2 WHERE directive_id IS NOT NULL;

        SELECT count(*) INTO prds_aligned
        FROM product_requirements_v2
        WHERE sd_id = directive_id;

        RAISE NOTICE 'PRD sd_id migration complete:';
        RAISE NOTICE '  Total PRDs: %', total_prds;
        RAISE NOTICE '  PRDs with sd_id: %', prds_with_sd;
        RAISE NOTICE '  PRDs with directive_id: %', prds_with_directive;
        RAISE NOTICE '  PRDs aligned (sd_id = directive_id): %', prds_aligned;
    ELSE
        RAISE NOTICE 'PRD sd_id migration complete:';
        RAISE NOTICE '  Total PRDs: %', total_prds;
        RAISE NOTICE '  PRDs with sd_id: %', prds_with_sd;
        RAISE NOTICE '  No directive_id column present (new schema)';
    END IF;

    -- Warning if there are PRDs without sd_id
    IF prds_with_sd < total_prds AND total_prds > 0 THEN
        RAISE WARNING 'Some PRDs still have NULL sd_id values. Manual review may be needed.';
    END IF;
END $$;

COMMIT;

-- Migration verification
\echo '✅ Migration 2025-09-22-prd-add-sd-id.sql completed successfully'
\echo '📊 product_requirements_v2 now has sd_id column for pipeline compatibility'
\echo '🔄 Legacy directive_id preserved for backward compatibility'