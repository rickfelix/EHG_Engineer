-- Migration: Venture Origin Tracking
-- SD: SD-STAGE1-ENTRY-UX-001 (Phase 1 Database Foundation)
-- Date: 2025-12-01
-- Purpose: Add origin tracking columns to ventures table and create supporting tables
--
-- This migration supports the three venture creation paths:
-- 1. Manual Entry (origin_type = 'manual')
-- 2. Competitor Clone (origin_type = 'competitor_clone')
-- 3. Blueprint Browse (origin_type = 'blueprint')

-- ============================================================================
-- PART 1: Add origin tracking columns to ventures table
-- ============================================================================

-- Create the enum type for venture origin (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'venture_origin_type') THEN
        CREATE TYPE venture_origin_type AS ENUM ('manual', 'competitor_clone', 'blueprint');
    END IF;
END$$;

-- Add origin_type column (defaults to 'manual' for backward compatibility)
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS origin_type venture_origin_type DEFAULT 'manual';

-- Add competitor_ref for tracking cloned competitor URL
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS competitor_ref TEXT;

-- Add blueprint_id for tracking selected blueprint (TEXT to match E2E test expectations)
-- E2E tests use 'bp-test-001' format, not UUID
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS blueprint_id TEXT;

-- Add solution column if not exists (required by Stage1Output schema)
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS solution TEXT;

-- ============================================================================
-- PART 2: Create blueprint_selection_signals table for ML preference tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_selection_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id UUID REFERENCES opportunity_blueprints(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,  -- 'view', 'hover', 'select', 'customize', 'dismiss'
    metadata JSONB DEFAULT '{}',      -- Session context, time spent, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_blueprint_signals_blueprint
    ON blueprint_selection_signals(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_signals_user
    ON blueprint_selection_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_signals_type
    ON blueprint_selection_signals(event_type);
CREATE INDEX IF NOT EXISTS idx_blueprint_signals_created
    ON blueprint_selection_signals(created_at DESC);

-- ============================================================================
-- PART 3: Create competitors table for Stage 4 Competitive Intelligence
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    website TEXT,
    description TEXT,
    strengths TEXT[] DEFAULT '{}',
    weaknesses TEXT[] DEFAULT '{}',
    analysis_data JSONB DEFAULT '{}',  -- AI-generated analysis results
    source_url TEXT,                    -- Original URL analyzed
    analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_competitors_venture
    ON competitors(venture_id);
CREATE INDEX IF NOT EXISTS idx_competitors_name
    ON competitors(name);
CREATE INDEX IF NOT EXISTS idx_competitors_analyzed
    ON competitors(analyzed_at DESC);

-- ============================================================================
-- PART 4: Enable Row Level Security
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE blueprint_selection_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: RLS Policies for blueprint_selection_signals
-- ============================================================================

-- Users can view their own signals
DROP POLICY IF EXISTS "Users can view own signals" ON blueprint_selection_signals;
CREATE POLICY "Users can view own signals"
    ON blueprint_selection_signals
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own signals
DROP POLICY IF EXISTS "Users can insert own signals" ON blueprint_selection_signals;
CREATE POLICY "Users can insert own signals"
    ON blueprint_selection_signals
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role has full access (for analytics)
DROP POLICY IF EXISTS "Service role full access signals" ON blueprint_selection_signals;
CREATE POLICY "Service role full access signals"
    ON blueprint_selection_signals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- PART 6: RLS Policies for competitors
-- ============================================================================

-- Users can view competitors for ventures they own
DROP POLICY IF EXISTS "Users can view own venture competitors" ON competitors;
CREATE POLICY "Users can view own venture competitors"
    ON competitors
    FOR SELECT
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE user_id = auth.uid()
        )
    );

-- Users can insert competitors for ventures they own
DROP POLICY IF EXISTS "Users can insert own venture competitors" ON competitors;
CREATE POLICY "Users can insert own venture competitors"
    ON competitors
    FOR INSERT
    WITH CHECK (
        venture_id IN (
            SELECT id FROM ventures WHERE user_id = auth.uid()
        )
    );

-- Users can update competitors for ventures they own
DROP POLICY IF EXISTS "Users can update own venture competitors" ON competitors;
CREATE POLICY "Users can update own venture competitors"
    ON competitors
    FOR UPDATE
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE user_id = auth.uid()
        )
    );

-- Users can delete competitors for ventures they own
DROP POLICY IF EXISTS "Users can delete own venture competitors" ON competitors;
CREATE POLICY "Users can delete own venture competitors"
    ON competitors
    FOR DELETE
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE user_id = auth.uid()
        )
    );

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access competitors" ON competitors;
CREATE POLICY "Service role full access competitors"
    ON competitors
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- PART 7: Add updated_at trigger for competitors
-- ============================================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_competitors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS competitors_updated_at ON competitors;
CREATE TRIGGER competitors_updated_at
    BEFORE UPDATE ON competitors
    FOR EACH ROW
    EXECUTE FUNCTION update_competitors_updated_at();

-- ============================================================================
-- PART 8: Create index on ventures.origin_type for filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ventures_origin_type
    ON ventures(origin_type);

-- ============================================================================
-- VERIFICATION: Comment explaining expected state
-- ============================================================================
-- After running this migration:
-- 1. ventures table has: origin_type, competitor_ref, blueprint_id, solution columns
-- 2. blueprint_selection_signals table exists with RLS
-- 3. competitors table exists with RLS
-- 4. All existing ventures default to origin_type = 'manual'
-- 5. opportunity_blueprints table already exists (from SD-BLUEPRINT-ENGINE-001)
