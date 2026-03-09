-- Migration: EVA Consultant Agent Phase 0
-- Date: 2026-03-09
-- SD: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-001
-- Purpose: Create tables for weekly trend snapshots and source health tracking
-- Phase: 0 (no LLM dependency - pure aggregation and freshness tracking)

-- ============================================================================
-- Table 1: eva_consultant_snapshots
-- Weekly trend snapshot aggregations (no LLM required)
-- One snapshot per day containing aggregated statistics across all sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_consultant_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL UNIQUE,
    source_counts JSONB NOT NULL DEFAULT '{}',
    top_aspects_by_app JSONB NOT NULL DEFAULT '{}',
    top_intents JSONB NOT NULL DEFAULT '{}',
    new_item_velocity JSONB NOT NULL DEFAULT '{}',
    raw_cluster_data JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eva_consultant_snapshots IS 'Weekly trend snapshot aggregations for EVA Consultant Agent Phase 0. No LLM dependency.';
COMMENT ON COLUMN eva_consultant_snapshots.snapshot_date IS 'Date of this snapshot - one per day, UNIQUE constraint enforced';
COMMENT ON COLUMN eva_consultant_snapshots.source_counts IS 'Items per source per week, e.g. {"todoist": 45, "youtube": 12}';
COMMENT ON COLUMN eva_consultant_snapshots.top_aspects_by_app IS 'Top aspects per application, e.g. {"ehg_engineer": {"leo_protocol": 15, "eva_pipeline": 8}}';
COMMENT ON COLUMN eva_consultant_snapshots.top_intents IS 'Intent distribution, e.g. {"idea": 30, "insight": 12, "reference": 8}';
COMMENT ON COLUMN eva_consultant_snapshots.new_item_velocity IS 'Items/week vs prior 4-week avg per app, e.g. {"ehg_engineer": {"current": 15, "avg_4wk": 10, "change_pct": 50}}';
COMMENT ON COLUMN eva_consultant_snapshots.raw_cluster_data IS 'Raw aggregate statistics for manual review (nullable)';

-- Index on snapshot_date for efficient date-range queries
CREATE INDEX IF NOT EXISTS idx_eva_consultant_snapshots_date
    ON eva_consultant_snapshots (snapshot_date);

-- ============================================================================
-- Table 2: eva_source_health
-- Data freshness tracking per input source
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_source_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL UNIQUE,
    last_sync_at TIMESTAMPTZ,
    last_item_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'stale')),
    degraded_since TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eva_source_health IS 'Data freshness tracking per EVA input source. Monitors sync status and health.';
COMMENT ON COLUMN eva_source_health.source_name IS 'Source identifier, e.g. todoist, youtube';
COMMENT ON COLUMN eva_source_health.last_sync_at IS 'Timestamp of last successful sync';
COMMENT ON COLUMN eva_source_health.last_item_count IS 'Number of items from last sync';
COMMENT ON COLUMN eva_source_health.status IS 'Health status: healthy, degraded, or stale';
COMMENT ON COLUMN eva_source_health.degraded_since IS 'Timestamp when source first became degraded';

-- Index on source_name for lookups
CREATE INDEX IF NOT EXISTS idx_eva_source_health_source_name
    ON eva_source_health (source_name);

-- Index on status for filtering by health state
CREATE INDEX IF NOT EXISTS idx_eva_source_health_status
    ON eva_source_health (status);

-- ============================================================================
-- Auto-update trigger for eva_source_health.updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_eva_source_health_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eva_source_health_updated_at ON eva_source_health;
CREATE TRIGGER trg_eva_source_health_updated_at
    BEFORE UPDATE ON eva_source_health
    FOR EACH ROW
    EXECUTE FUNCTION update_eva_source_health_updated_at();

-- ============================================================================
-- RLS Policies
-- Internal pipeline only: service role gets full CRUD, no authenticated access
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE eva_consultant_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_source_health ENABLE ROW LEVEL SECURITY;

-- eva_consultant_snapshots: service role full access
CREATE POLICY service_role_all_eva_consultant_snapshots
    ON eva_consultant_snapshots
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- eva_source_health: service role full access
CREATE POLICY service_role_all_eva_source_health
    ON eva_source_health
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Anon read access for dashboard queries (read-only)
CREATE POLICY anon_select_eva_consultant_snapshots
    ON eva_consultant_snapshots
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY anon_select_eva_source_health
    ON eva_source_health
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================================
-- Rollback SQL (reference only - do not execute)
-- ============================================================================
-- DROP POLICY IF EXISTS anon_select_eva_source_health ON eva_source_health;
-- DROP POLICY IF EXISTS anon_select_eva_consultant_snapshots ON eva_consultant_snapshots;
-- DROP POLICY IF EXISTS service_role_all_eva_source_health ON eva_source_health;
-- DROP POLICY IF EXISTS service_role_all_eva_consultant_snapshots ON eva_consultant_snapshots;
-- DROP TRIGGER IF EXISTS trg_eva_source_health_updated_at ON eva_source_health;
-- DROP FUNCTION IF EXISTS update_eva_source_health_updated_at();
-- DROP TABLE IF EXISTS eva_source_health;
-- DROP TABLE IF EXISTS eva_consultant_snapshots;
