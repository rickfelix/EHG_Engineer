-- ============================================================================
-- EVA Daily YouTube Subscription Digest Tables
-- Feature: Automated daily scanning of YouTube subscriptions, relevance
--          scoring via EVA, and Todoist delivery of recommendations.
-- ============================================================================

-- ============================================================================
-- 1. EVA_YOUTUBE_SCANS - Daily scan metadata
-- Tracks each daily scan run: how many channels/videos were processed,
-- how many passed the relevance threshold, and overall scan status.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_youtube_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scan identification
    scan_date DATE NOT NULL,

    -- Scan metrics
    channel_count INTEGER,
    video_count INTEGER,
    videos_above_threshold INTEGER,

    -- Workflow status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'scoring', 'scored', 'approved', 'delivered', 'failed'
    )),

    -- Configuration
    dry_run BOOLEAN NOT NULL DEFAULT true,

    -- Performance
    scan_duration_ms INTEGER,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate scans per day
    CONSTRAINT unique_scan_per_day UNIQUE (scan_date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_eva_youtube_scans_date ON eva_youtube_scans(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_scans_status ON eva_youtube_scans(status);

-- ============================================================================
-- 2. EVA_YOUTUBE_SCORES - Per-video relevance scores
-- Each video discovered during a scan gets scored for relevance to the
-- user's venture portfolio. Scores drive approval and Todoist delivery.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_youtube_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to parent scan
    scan_id UUID NOT NULL REFERENCES eva_youtube_scans(id) ON DELETE CASCADE,

    -- YouTube video identification
    video_id TEXT NOT NULL,
    video_url TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_name TEXT,
    channel_id TEXT,
    published_at TIMESTAMPTZ,

    -- EVA scoring
    relevance_score INTEGER CHECK (relevance_score >= 0 AND relevance_score <= 100),
    venture_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    reasoning TEXT,

    -- Workflow status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'scored', 'approved', 'rejected', 'delivered'
    )),

    -- Approval tracking
    approved_at TIMESTAMPTZ,

    -- Todoist integration
    todoist_task_id TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate video entries per scan
    CONSTRAINT unique_video_per_scan UNIQUE (scan_id, video_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_eva_youtube_scores_scan ON eva_youtube_scores(scan_id);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_scores_status ON eva_youtube_scores(status);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_scores_relevance ON eva_youtube_scores(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_scores_video ON eva_youtube_scores(video_id);

-- ============================================================================
-- 3. EVA_YOUTUBE_CONFIG - Channel and interest configuration
-- Stores subscribed YouTube channels and per-channel scoring configuration.
-- The interest_profile JSONB field holds venture-specific keywords that
-- influence relevance scoring.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_youtube_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Channel identification
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    rss_url TEXT,

    -- Configuration
    active BOOLEAN NOT NULL DEFAULT true,
    score_threshold INTEGER NOT NULL DEFAULT 70,
    max_recommendations INTEGER NOT NULL DEFAULT 15,

    -- Venture interest keywords for relevance scoring
    interest_profile JSONB,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One config entry per channel
    CONSTRAINT unique_channel_config UNIQUE (channel_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eva_youtube_config_active ON eva_youtube_config(active) WHERE active = true;

-- ============================================================================
-- TRIGGERS - Auto-update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_eva_youtube_scans_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eva_youtube_scans_updated
    BEFORE UPDATE ON eva_youtube_scans
    FOR EACH ROW
    EXECUTE FUNCTION update_eva_youtube_scans_timestamp();

CREATE OR REPLACE FUNCTION update_eva_youtube_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eva_youtube_config_updated
    BEFORE UPDATE ON eva_youtube_config
    FOR EACH ROW
    EXECUTE FUNCTION update_eva_youtube_config_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE eva_youtube_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_youtube_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_youtube_config ENABLE ROW LEVEL SECURITY;

-- Policies: Allow full access for authenticated users (single-tenant system)
CREATE POLICY "eva_youtube_scans_select" ON eva_youtube_scans
    FOR SELECT USING (true);

CREATE POLICY "eva_youtube_scans_insert" ON eva_youtube_scans
    FOR INSERT WITH CHECK (true);

CREATE POLICY "eva_youtube_scans_update" ON eva_youtube_scans
    FOR UPDATE USING (true);

CREATE POLICY "eva_youtube_scores_select" ON eva_youtube_scores
    FOR SELECT USING (true);

CREATE POLICY "eva_youtube_scores_insert" ON eva_youtube_scores
    FOR INSERT WITH CHECK (true);

CREATE POLICY "eva_youtube_scores_update" ON eva_youtube_scores
    FOR UPDATE USING (true);

CREATE POLICY "eva_youtube_config_select" ON eva_youtube_config
    FOR SELECT USING (true);

CREATE POLICY "eva_youtube_config_insert" ON eva_youtube_config
    FOR INSERT WITH CHECK (true);

CREATE POLICY "eva_youtube_config_update" ON eva_youtube_config
    FOR UPDATE USING (true);

CREATE POLICY "eva_youtube_config_delete" ON eva_youtube_config
    FOR DELETE USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE eva_youtube_scans IS 'Daily scan metadata for EVA YouTube Subscription Digest - tracks each automated scan run';
COMMENT ON TABLE eva_youtube_scores IS 'Per-video relevance scores from EVA scoring of YouTube subscription content';
COMMENT ON TABLE eva_youtube_config IS 'YouTube channel subscriptions and per-channel scoring configuration for EVA digest';

COMMENT ON COLUMN eva_youtube_scans.scan_date IS 'Date of the scan run (one scan per day)';
COMMENT ON COLUMN eva_youtube_scans.videos_above_threshold IS 'Number of videos that scored above the relevance threshold';
COMMENT ON COLUMN eva_youtube_scans.dry_run IS 'When true, scan runs in preview mode without delivering to Todoist';

COMMENT ON COLUMN eva_youtube_scores.video_id IS 'YouTube video ID (the 11-character identifier)';
COMMENT ON COLUMN eva_youtube_scores.relevance_score IS 'EVA relevance score 0-100, higher = more relevant to venture portfolio';
COMMENT ON COLUMN eva_youtube_scores.venture_tags IS 'JSONB array of venture names/tags this video is relevant to';
COMMENT ON COLUMN eva_youtube_scores.todoist_task_id IS 'Todoist task ID when video recommendation has been delivered';

COMMENT ON COLUMN eva_youtube_config.score_threshold IS 'Minimum relevance score for a video to be recommended (default 70)';
COMMENT ON COLUMN eva_youtube_config.max_recommendations IS 'Maximum videos to recommend per scan for this channel (default 15)';
COMMENT ON COLUMN eva_youtube_config.interest_profile IS 'JSONB object with venture interest keywords for relevance scoring';

-- ============================================================================
-- ROLLBACK (for reference)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_eva_youtube_config_updated ON eva_youtube_config;
-- DROP TRIGGER IF EXISTS trg_eva_youtube_scans_updated ON eva_youtube_scans;
-- DROP FUNCTION IF EXISTS update_eva_youtube_config_timestamp();
-- DROP FUNCTION IF EXISTS update_eva_youtube_scans_timestamp();
-- DROP TABLE IF EXISTS eva_youtube_scores;
-- DROP TABLE IF EXISTS eva_youtube_config;
-- DROP TABLE IF EXISTS eva_youtube_scans;
