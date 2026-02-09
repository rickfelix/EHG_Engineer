-- Migration: EVA Idea Processing Pipeline - Intake Tables and Schema
-- SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001A
-- Created: 2026-02-09
-- Purpose: Create database schema for EVA idea intake pipeline (Todoist + YouTube)
-- Tables: eva_todoist_intake, eva_youtube_intake, eva_idea_categories, eva_sync_state
-- Also: Update feedback.source_type CHECK constraint

-- ============================================================================
-- Table: eva_idea_categories
-- Purpose: Hybrid classification taxonomy (venture_tag + business_function)
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_idea_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_type TEXT NOT NULL CHECK (category_type IN ('venture_tag', 'business_function')),
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    classification_keywords TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_type, code)
);

CREATE INDEX IF NOT EXISTS idx_eva_idea_categories_type ON eva_idea_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_eva_idea_categories_active ON eva_idea_categories(is_active) WHERE is_active = TRUE;

-- Seed data: 6 venture tags
INSERT INTO eva_idea_categories (category_type, code, label, description, classification_keywords, sort_order)
VALUES
  ('venture_tag', 'leo', 'LEO Protocol', 'LEO engineering workflow and protocol improvements', ARRAY['leo', 'protocol', 'workflow', 'sd', 'handoff', 'gate'], 1),
  ('venture_tag', 'eva', 'EVA Platform', 'EVA operating system and chairman tools', ARRAY['eva', 'chairman', 'portfolio', 'venture', 'decision'], 2),
  ('venture_tag', 'playlist_pilot', 'Playlist Pilot', 'PlaylistPilot music app features', ARRAY['playlist', 'music', 'spotify', 'youtube music', 'playlistpilot'], 3),
  ('venture_tag', 'ehg_platform', 'EHG Platform', 'EHG platform and infrastructure', ARRAY['ehg', 'platform', 'infrastructure', 'dashboard'], 4),
  ('venture_tag', 'new_venture', 'New Venture', 'Ideas for entirely new ventures', ARRAY['new', 'startup', 'venture', 'idea', 'concept'], 5),
  ('venture_tag', 'cross_venture', 'Cross-Venture', 'Ideas spanning multiple ventures', ARRAY['cross', 'shared', 'common', 'reuse', 'platform'], 6)
ON CONFLICT (category_type, code) DO NOTHING;

-- Seed data: 10 business functions
INSERT INTO eva_idea_categories (category_type, code, label, description, classification_keywords, sort_order)
VALUES
  ('business_function', 'feature_idea', 'Feature Idea', 'New product feature or capability', ARRAY['feature', 'add', 'build', 'create', 'implement'], 1),
  ('business_function', 'market_insight', 'Market Insight', 'Market trends, opportunities, or signals', ARRAY['market', 'trend', 'opportunity', 'industry', 'growth'], 2),
  ('business_function', 'competitor_intel', 'Competitor Intelligence', 'Competitor analysis or positioning', ARRAY['competitor', 'competitive', 'alternative', 'versus', 'compare'], 3),
  ('business_function', 'ux_improvement', 'UX Improvement', 'User experience enhancement', ARRAY['ux', 'usability', 'user experience', 'interface', 'flow'], 4),
  ('business_function', 'tech_debt', 'Technical Debt', 'Code quality, refactoring, architecture', ARRAY['debt', 'refactor', 'cleanup', 'architecture', 'technical'], 5),
  ('business_function', 'ops_process', 'Operations/Process', 'Operational efficiency improvements', ARRAY['process', 'operations', 'automation', 'efficiency', 'workflow'], 6),
  ('business_function', 'content_strategy', 'Content Strategy', 'Content creation, marketing, or SEO', ARRAY['content', 'seo', 'blog', 'marketing', 'copy'], 7),
  ('business_function', 'partnership', 'Partnership/Integration', 'Third-party integrations or partnerships', ARRAY['partner', 'integration', 'api', 'connect', 'sync'], 8),
  ('business_function', 'revenue_model', 'Revenue Model', 'Monetization, pricing, or business model', ARRAY['revenue', 'pricing', 'monetize', 'subscription', 'payment'], 9),
  ('business_function', 'learning_resource', 'Learning Resource', 'Educational content, tutorials, or references', ARRAY['learn', 'tutorial', 'course', 'resource', 'reference'], 10)
ON CONFLICT (category_type, code) DO NOTHING;

-- ============================================================================
-- Table: eva_sync_state
-- Purpose: Track sync state per external source (circuit breaker health)
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL CHECK (source_type IN ('todoist', 'youtube')),
    source_identifier TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_sync_cursor TEXT,
    total_synced INTEGER DEFAULT 0,
    source_metadata JSONB DEFAULT '{}',
    consecutive_failures INTEGER DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_type, source_identifier)
);

CREATE INDEX IF NOT EXISTS idx_eva_sync_state_source ON eva_sync_state(source_type);
CREATE INDEX IF NOT EXISTS idx_eva_sync_state_active ON eva_sync_state(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- Table: eva_todoist_intake
-- Purpose: Todoist task intake from EVA and EVA Next Steps projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_todoist_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Todoist source data
    todoist_task_id TEXT NOT NULL UNIQUE,
    todoist_project_id TEXT,
    todoist_project_name TEXT,
    title TEXT NOT NULL,
    description TEXT,
    todoist_labels TEXT[] DEFAULT '{}',
    todoist_priority INTEGER CHECK (todoist_priority BETWEEN 1 AND 4),
    todoist_url TEXT,
    todoist_due_date TIMESTAMPTZ,

    -- AI classification (hybrid tags)
    venture_tag TEXT,
    business_function TEXT,
    confidence_score DECIMAL(3, 2) CHECK (confidence_score BETWEEN 0 AND 1),

    -- Pipeline state
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'evaluating', 'approved', 'rejected',
        'needs_revision', 'processed', 'error'
    )),
    feedback_id UUID,
    evaluation_outcome JSONB,
    processed_at TIMESTAMPTZ,

    -- Raw data for debugging
    raw_data JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_status ON eva_todoist_intake(status);
CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_venture ON eva_todoist_intake(venture_tag);
CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_project ON eva_todoist_intake(todoist_project_name);
CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_pending ON eva_todoist_intake(status) WHERE status = 'pending';

-- ============================================================================
-- Table: eva_youtube_intake
-- Purpose: YouTube video intake from "For Processing" playlist
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_youtube_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- YouTube source data
    youtube_video_id TEXT NOT NULL UNIQUE,
    youtube_playlist_item_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    channel_name TEXT,
    duration_seconds INTEGER,
    thumbnail_url TEXT,
    tags TEXT[] DEFAULT '{}',
    published_at TIMESTAMPTZ,

    -- AI-generated content analysis
    ai_summary TEXT,
    ai_key_insights JSONB DEFAULT '[]',

    -- AI classification (hybrid tags)
    venture_tag TEXT,
    business_function TEXT,
    confidence_score DECIMAL(3, 2) CHECK (confidence_score BETWEEN 0 AND 1),

    -- Pipeline state
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'evaluating', 'approved', 'rejected',
        'needs_revision', 'processed', 'error'
    )),
    feedback_id UUID,
    evaluation_outcome JSONB,
    processed_at TIMESTAMPTZ,
    destination_playlist_id TEXT,

    -- Raw data for debugging
    raw_data JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eva_youtube_intake_status ON eva_youtube_intake(status);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_intake_venture ON eva_youtube_intake(venture_tag);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_intake_channel ON eva_youtube_intake(channel_name);
CREATE INDEX IF NOT EXISTS idx_eva_youtube_intake_pending ON eva_youtube_intake(status) WHERE status = 'pending';

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- eva_idea_categories
ALTER TABLE eva_idea_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_eva_idea_categories ON eva_idea_categories;
DROP POLICY IF EXISTS manage_eva_idea_categories ON eva_idea_categories;
CREATE POLICY select_eva_idea_categories ON eva_idea_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_eva_idea_categories ON eva_idea_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- eva_sync_state
ALTER TABLE eva_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_eva_sync_state ON eva_sync_state;
DROP POLICY IF EXISTS manage_eva_sync_state ON eva_sync_state;
CREATE POLICY select_eva_sync_state ON eva_sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_eva_sync_state ON eva_sync_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- eva_todoist_intake
ALTER TABLE eva_todoist_intake ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_eva_todoist_intake ON eva_todoist_intake;
DROP POLICY IF EXISTS manage_eva_todoist_intake ON eva_todoist_intake;
CREATE POLICY select_eva_todoist_intake ON eva_todoist_intake FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_eva_todoist_intake ON eva_todoist_intake FOR ALL TO service_role USING (true) WITH CHECK (true);

-- eva_youtube_intake
ALTER TABLE eva_youtube_intake ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_eva_youtube_intake ON eva_youtube_intake;
DROP POLICY IF EXISTS manage_eva_youtube_intake ON eva_youtube_intake;
CREATE POLICY select_eva_youtube_intake ON eva_youtube_intake FOR SELECT TO authenticated USING (true);
CREATE POLICY manage_eva_youtube_intake ON eva_youtube_intake FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Update feedback.source_type CHECK constraint
-- Pattern from: 392_quality_lifecycle_fixes.sql
-- ============================================================================

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;

ALTER TABLE feedback ADD CONSTRAINT feedback_source_type_check
  CHECK (source_type IN (
    'manual_feedback',       -- Original: user-submitted feedback via UI/CLI
    'auto_capture',          -- Original: automated capture systems
    'uat_failure',           -- Original: UAT test failures
    'error_capture',         -- Code: default for captureError()
    'uncaught_exception',    -- Code: process.on('uncaughtException')
    'unhandled_rejection',   -- Code: process.on('unhandledRejection')
    'manual_capture',        -- Code: captureException() API
    'todoist_intake',        -- EVA: Ideas from Todoist sync
    'youtube_intake'         -- EVA: Ideas from YouTube sync
  ));

-- ============================================================================
-- Updated at trigger function (reuse if exists, create if not)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_eva_intake_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eva_todoist_intake_updated ON eva_todoist_intake;
CREATE TRIGGER trg_eva_todoist_intake_updated
  BEFORE UPDATE ON eva_todoist_intake
  FOR EACH ROW EXECUTE FUNCTION update_eva_intake_updated_at();

DROP TRIGGER IF EXISTS trg_eva_youtube_intake_updated ON eva_youtube_intake;
CREATE TRIGGER trg_eva_youtube_intake_updated
  BEFORE UPDATE ON eva_youtube_intake
  FOR EACH ROW EXECUTE FUNCTION update_eva_intake_updated_at();

DROP TRIGGER IF EXISTS trg_eva_sync_state_updated ON eva_sync_state;
CREATE TRIGGER trg_eva_sync_state_updated
  BEFORE UPDATE ON eva_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_eva_intake_updated_at();

DROP TRIGGER IF EXISTS trg_eva_idea_categories_updated ON eva_idea_categories;
CREATE TRIGGER trg_eva_idea_categories_updated
  BEFORE UPDATE ON eva_idea_categories
  FOR EACH ROW EXECUTE FUNCTION update_eva_intake_updated_at();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- 1. Created eva_idea_categories with 16 seed rows (6 venture_tag + 10 business_function)
-- 2. Created eva_sync_state for source sync tracking with circuit breaker fields
-- 3. Created eva_todoist_intake for Todoist task ingestion
-- 4. Created eva_youtube_intake for YouTube video ingestion
-- 5. Added RLS policies (SELECT for authenticated, ALL for service_role)
-- 6. Updated feedback.source_type CHECK to include todoist_intake and youtube_intake
-- 7. Created updated_at triggers for all 4 tables
