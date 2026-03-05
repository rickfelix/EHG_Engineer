-- ============================================================================
-- Migration: Venture Exit Readiness Foundation
-- SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-A
-- Date: 2026-03-05
-- Description: Foundation schema for acquisition-readiness tracking.
--   Step 1: CREATE venture_asset_registry (asset inventory with provenance)
--   Step 2: CREATE venture_exit_profiles (per-venture exit model with version history)
--   Step 3: ALTER ventures pipeline_mode to support exit states
--   Step 4: Enable RLS + create policies
--   Step 5: Create indexes for performance
-- ============================================================================

-- Step 1: venture_asset_registry
CREATE TABLE IF NOT EXISTS venture_asset_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    asset_name TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN (
        'intellectual_property', 'software', 'data', 'brand',
        'domain', 'patent', 'trademark', 'contract', 'license',
        'customer_list', 'partnership', 'infrastructure', 'other'
    )),
    description TEXT,
    estimated_value DECIMAL(15, 2),
    provenance JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE venture_asset_registry IS 'Tracks assets owned by each venture for acquisition readiness assessment';
COMMENT ON COLUMN venture_asset_registry.asset_type IS 'Category of asset: IP, software, data, brand, etc.';
COMMENT ON COLUMN venture_asset_registry.provenance IS 'JSON tracking origin, acquisition date, transfer history';

-- Step 2: venture_exit_profiles
CREATE TABLE IF NOT EXISTS venture_exit_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    exit_model TEXT NOT NULL CHECK (exit_model IN (
        'full_acquisition', 'licensing', 'revenue_share',
        'acqui_hire', 'asset_sale', 'merger'
    )),
    version INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    target_buyer_type TEXT CHECK (target_buyer_type IN (
        'strategic', 'financial', 'competitor', 'partner', 'unknown'
    )),
    is_current BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE venture_exit_profiles IS 'Per-venture exit model selection with version history';
COMMENT ON COLUMN venture_exit_profiles.is_current IS 'Only one profile per venture should be current';
COMMENT ON COLUMN venture_exit_profiles.version IS 'Incremented each time exit model changes for a venture';

-- Step 3: Extend pipeline_mode on ventures table
-- First check if column exists, add if not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ventures' AND column_name = 'pipeline_mode'
    ) THEN
        ALTER TABLE ventures ADD COLUMN pipeline_mode TEXT DEFAULT 'building'
            CHECK (pipeline_mode IN (
                'building', 'operations', 'growth', 'scaling',
                'exit_prep', 'divesting', 'sold'
            ));
        COMMENT ON COLUMN ventures.pipeline_mode IS 'Venture lifecycle mode including exit readiness states';
    ELSE
        -- Column exists: drop old constraint and add new one with exit states
        -- Find and drop existing CHECK constraint on pipeline_mode
        DECLARE
            constraint_name TEXT;
        BEGIN
            SELECT con.conname INTO constraint_name
            FROM pg_constraint con
            JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
            JOIN pg_class cls ON cls.oid = con.conrelid
            WHERE cls.relname = 'ventures'
              AND att.attname = 'pipeline_mode'
              AND con.contype = 'c';

            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE ventures DROP CONSTRAINT %I', constraint_name);
            END IF;
        END;

        -- Add updated constraint with exit states
        ALTER TABLE ventures ADD CONSTRAINT ventures_pipeline_mode_check
            CHECK (pipeline_mode IN (
                'building', 'operations', 'growth', 'scaling',
                'exit_prep', 'divesting', 'sold'
            ));
    END IF;
END $$;

-- Step 4: Enable RLS and create policies
ALTER TABLE venture_asset_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_exit_profiles ENABLE ROW LEVEL SECURITY;

-- Asset registry policies
CREATE POLICY IF NOT EXISTS "asset_registry_select_authenticated"
    ON venture_asset_registry FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "asset_registry_insert_authenticated"
    ON venture_asset_registry FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "asset_registry_update_authenticated"
    ON venture_asset_registry FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "asset_registry_delete_authenticated"
    ON venture_asset_registry FOR DELETE
    TO authenticated
    USING (true);

-- Exit profiles policies
CREATE POLICY IF NOT EXISTS "exit_profiles_select_authenticated"
    ON venture_exit_profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "exit_profiles_insert_authenticated"
    ON venture_exit_profiles FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "exit_profiles_update_authenticated"
    ON venture_exit_profiles FOR UPDATE
    TO authenticated
    USING (true);

-- Service role bypass for both tables
CREATE POLICY IF NOT EXISTS "asset_registry_service_role"
    ON venture_asset_registry FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "exit_profiles_service_role"
    ON venture_exit_profiles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Step 5: Indexes
CREATE INDEX IF NOT EXISTS idx_asset_registry_venture_id
    ON venture_asset_registry(venture_id);

CREATE INDEX IF NOT EXISTS idx_asset_registry_asset_type
    ON venture_asset_registry(asset_type);

CREATE INDEX IF NOT EXISTS idx_exit_profiles_venture_id
    ON venture_exit_profiles(venture_id);

CREATE INDEX IF NOT EXISTS idx_exit_profiles_current
    ON venture_exit_profiles(venture_id, is_current)
    WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_ventures_pipeline_mode
    ON ventures(pipeline_mode)
    WHERE pipeline_mode IS NOT NULL;

-- ============================================================================
-- ROLLBACK (if needed):
-- DROP INDEX IF EXISTS idx_ventures_pipeline_mode;
-- DROP INDEX IF EXISTS idx_exit_profiles_current;
-- DROP INDEX IF EXISTS idx_exit_profiles_venture_id;
-- DROP INDEX IF EXISTS idx_asset_registry_asset_type;
-- DROP INDEX IF EXISTS idx_asset_registry_venture_id;
-- DROP TABLE IF EXISTS venture_exit_profiles;
-- DROP TABLE IF EXISTS venture_asset_registry;
-- ALTER TABLE ventures DROP CONSTRAINT IF EXISTS ventures_pipeline_mode_check;
-- ============================================================================
