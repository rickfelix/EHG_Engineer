-- Migration: Create chairman_interests table
-- SD: SD-CHAIRMAN-INTERESTS-001
-- Author: Database Sub-Agent
-- Date: 2025-12-02
-- Description: Stores chairman's market interests, customer segments, focus areas, and exclusions
--              for personalized opportunity filtering and recommendation

-- ============================================================================
-- TABLE CREATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chairman_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    interest_type TEXT NOT NULL CHECK (interest_type IN ('market', 'customer_segment', 'focus_area', 'exclusion')),
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for user lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_chairman_interests_user_id
    ON public.chairman_interests(user_id);

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_chairman_interests_type
    ON public.chairman_interests(interest_type);

-- Index for active interests (common filter)
CREATE INDEX IF NOT EXISTS idx_chairman_interests_active
    ON public.chairman_interests(user_id, is_active)
    WHERE is_active = true;

-- Composite index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_chairman_interests_priority
    ON public.chairman_interests(user_id, interest_type, priority DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

-- Create trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_chairman_interests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS chairman_interests_updated_at ON public.chairman_interests;

CREATE TRIGGER chairman_interests_updated_at
    BEFORE UPDATE ON public.chairman_interests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_chairman_interests_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE public.chairman_interests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own interests
CREATE POLICY select_own_chairman_interests ON public.chairman_interests
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Users can INSERT their own interests
CREATE POLICY insert_own_chairman_interests ON public.chairman_interests
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can UPDATE their own interests
CREATE POLICY update_own_chairman_interests ON public.chairman_interests
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own interests
CREATE POLICY delete_own_chairman_interests ON public.chairman_interests
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================================
-- SERVICE ROLE ACCESS (for administrative operations)
-- ============================================================================

-- Policy: Service role has full access (for admin operations)
CREATE POLICY service_role_chairman_interests ON public.chairman_interests
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE public.chairman_interests IS
'Stores chairman/user market interests, customer segments, focus areas, and exclusions for personalized opportunity filtering. SD-CHAIRMAN-INTERESTS-001.';

COMMENT ON COLUMN public.chairman_interests.interest_type IS
'Type of interest: market (industry/vertical), customer_segment (target customer type), focus_area (specific focus), exclusion (areas to avoid)';

COMMENT ON COLUMN public.chairman_interests.priority IS
'Priority level 1-10 where 10 is highest priority. Used for ranking and filtering recommendations.';
