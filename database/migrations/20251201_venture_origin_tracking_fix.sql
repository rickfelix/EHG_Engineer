-- Migration Fix: Venture Origin Tracking
-- SD: SD-STAGE1-ENTRY-UX-001 (Phase 1 Database Foundation - FIX)
-- Date: 2025-12-01
-- Purpose: Fix missing tables and RLS policies from original migration
--
-- Issues Fixed:
-- 1. opportunity_blueprints table was missing (schema analysis incorrectly stated it existed)
-- 2. blueprint_selection_signals failed due to FK to missing opportunity_blueprints
-- 3. RLS policies for competitors referenced user_id instead of created_by
--
-- Note: ventures table uses 'created_by' column (not 'user_id') to reference owner

-- ============================================================================
-- PART 1: Create opportunity_blueprints table (required for blueprint_selection_signals FK)
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_blueprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    problem TEXT,
    solution TEXT,
    target_market TEXT,
    industry VARCHAR(100),
    business_model TEXT,
    category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    difficulty_level VARCHAR(50) DEFAULT 'intermediate',
    estimated_timeline VARCHAR(50),
    success_metrics JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_opportunity_blueprints_title
    ON opportunity_blueprints(title);
CREATE INDEX IF NOT EXISTS idx_opportunity_blueprints_category
    ON opportunity_blueprints(category);
CREATE INDEX IF NOT EXISTS idx_opportunity_blueprints_industry
    ON opportunity_blueprints(industry);
CREATE INDEX IF NOT EXISTS idx_opportunity_blueprints_active
    ON opportunity_blueprints(is_active);

-- Enable RLS
ALTER TABLE opportunity_blueprints ENABLE ROW LEVEL SECURITY;

-- Blueprints are public read, admin write
DROP POLICY IF EXISTS "Anyone can view active blueprints" ON opportunity_blueprints;
CREATE POLICY "Anyone can view active blueprints"
    ON opportunity_blueprints
    FOR SELECT
    USING (is_active = true);

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access blueprints" ON opportunity_blueprints;
CREATE POLICY "Service role full access blueprints"
    ON opportunity_blueprints
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- PART 2: Create blueprint_selection_signals table (now FK is valid)
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

-- Enable RLS
ALTER TABLE blueprint_selection_signals ENABLE ROW LEVEL SECURITY;

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
-- PART 3: Fix RLS Policies for competitors (use created_by instead of user_id)
-- ============================================================================

-- Drop failed policies if they exist (they may have partially created)
DROP POLICY IF EXISTS "Users can view own venture competitors" ON competitors;
DROP POLICY IF EXISTS "Users can insert own venture competitors" ON competitors;
DROP POLICY IF EXISTS "Users can update own venture competitors" ON competitors;
DROP POLICY IF EXISTS "Users can delete own venture competitors" ON competitors;

-- Users can view competitors for ventures they own
CREATE POLICY "Users can view own venture competitors"
    ON competitors
    FOR SELECT
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- Users can insert competitors for ventures they own
CREATE POLICY "Users can insert own venture competitors"
    ON competitors
    FOR INSERT
    WITH CHECK (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- Users can update competitors for ventures they own
CREATE POLICY "Users can update own venture competitors"
    ON competitors
    FOR UPDATE
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- Users can delete competitors for ventures they own
CREATE POLICY "Users can delete own venture competitors"
    ON competitors
    FOR DELETE
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- ============================================================================
-- PART 4: Add updated_at trigger for opportunity_blueprints
-- ============================================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_opportunity_blueprints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS opportunity_blueprints_updated_at ON opportunity_blueprints;
CREATE TRIGGER opportunity_blueprints_updated_at
    BEFORE UPDATE ON opportunity_blueprints
    FOR EACH ROW
    EXECUTE FUNCTION update_opportunity_blueprints_updated_at();

-- ============================================================================
-- VERIFICATION: Comment explaining expected state after this fix
-- ============================================================================
-- After running this fix migration:
-- 1. opportunity_blueprints table exists with public read access
-- 2. blueprint_selection_signals table exists with user-scoped access
-- 3. competitors table has proper RLS policies using created_by (not user_id)
-- 4. All tables have service_role full access for admin/analytics operations
