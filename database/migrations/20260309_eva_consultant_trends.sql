-- Migration: EVA Consultant Trends
-- Date: 2026-03-09
-- Purpose: Create eva_consultant_trends table for trend detection results
-- Tracks convergence, acceleration, gap, emerging, and decline trends across sources

-- ============================================================================
-- Table: eva_consultant_trends
-- Stores detected trends from cross-source analysis
-- Supports upsert via UNIQUE(trend_date, title)
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_consultant_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trend_date DATE NOT NULL,
    trend_type TEXT NOT NULL CHECK (trend_type IN ('convergence', 'acceleration', 'gap', 'emerging', 'decline')),
    title TEXT NOT NULL,
    description TEXT,
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    corroborating_items JSONB DEFAULT '[]',
    source_freshness JSONB DEFAULT '{}',
    application_domain TEXT,
    detected_by TEXT DEFAULT 'trend-detector.mjs',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_eva_consultant_trends_date_title UNIQUE (trend_date, title)
);

COMMENT ON TABLE eva_consultant_trends IS 'Detected trends from EVA Consultant cross-source analysis. One row per trend per date.';
COMMENT ON COLUMN eva_consultant_trends.trend_date IS 'Date the trend was detected';
COMMENT ON COLUMN eva_consultant_trends.trend_type IS 'Type of trend: convergence, acceleration, gap, emerging, or decline';
COMMENT ON COLUMN eva_consultant_trends.title IS 'Short title describing the trend';
COMMENT ON COLUMN eva_consultant_trends.description IS 'Detailed description of the trend and its implications';
COMMENT ON COLUMN eva_consultant_trends.confidence_score IS 'Confidence score 0.00-1.00 based on corroborating evidence';
COMMENT ON COLUMN eva_consultant_trends.corroborating_items IS 'Array of {source, id, title} objects that support this trend';
COMMENT ON COLUMN eva_consultant_trends.source_freshness IS 'Map of source name to freshness status at detection time';
COMMENT ON COLUMN eva_consultant_trends.application_domain IS 'Target application domain (application_domain value)';
COMMENT ON COLUMN eva_consultant_trends.detected_by IS 'Script or agent that detected this trend';

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_eva_consultant_trends_date
    ON eva_consultant_trends (trend_date DESC);

CREATE INDEX IF NOT EXISTS idx_eva_consultant_trends_app
    ON eva_consultant_trends (application_domain);

-- ============================================================================
-- RLS Policies
-- service_role: full CRUD
-- anon: SELECT only
-- ============================================================================

ALTER TABLE eva_consultant_trends ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY service_role_all_eva_consultant_trends
    ON eva_consultant_trends
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- anon: read-only access for dashboard queries
CREATE POLICY anon_select_eva_consultant_trends
    ON eva_consultant_trends
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================================
-- Rollback SQL (reference only - do not execute)
-- ============================================================================
-- DROP POLICY IF EXISTS anon_select_eva_consultant_trends ON eva_consultant_trends;
-- DROP POLICY IF EXISTS service_role_all_eva_consultant_trends ON eva_consultant_trends;
-- DROP INDEX IF EXISTS idx_eva_consultant_trends_app;
-- DROP INDEX IF EXISTS idx_eva_consultant_trends_date;
-- DROP TABLE IF EXISTS eva_consultant_trends;
