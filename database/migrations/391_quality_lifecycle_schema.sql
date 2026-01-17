-- Migration: Quality Lifecycle Database Foundation (SD-QUALITY-DB-001)
-- Created: 2026-01-17
-- Purpose: Unified feedback table for issues + enhancements, releases, feedback-SD mapping
-- Application: EHG Engineer (Management Dashboard)
-- Database: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)

-- =============================================================================
-- TABLE: feedback (Unified Issues + Enhancements)
-- =============================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- TYPE DISCRIMINATOR (issues vs enhancements)
  type VARCHAR(20) NOT NULL CHECK (type IN ('issue', 'enhancement')),

  -- Source identification (MULTI-VENTURE)
  source_application VARCHAR(50) NOT NULL,  -- 'ehg', 'venture_a', 'venture_b', etc.
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('manual_feedback', 'auto_capture', 'uat_failure')),
  source_id UUID,                           -- Link to uat_test_results if from /uat

  -- Common fields (both types)
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'backlog', 'shipped')),
  priority VARCHAR(10),                     -- P0-P3 for issues, high/med/low for enhancements

  -- Context
  sd_id VARCHAR(50),                        -- SD context (if applicable)
  user_id UUID,                             -- User who reported (if authenticated)
  session_id VARCHAR(100),                  -- Session context
  page_url VARCHAR(500),                    -- Page where feedback occurred (web)
  command VARCHAR(100),                     -- Command being run (CLI)
  environment JSONB,                        -- Browser, Node version, OS, etc.

  -- ISSUE-SPECIFIC (nullable for enhancements)
  severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category VARCHAR(50),                     -- bug, ux_issue, error
  error_message TEXT,
  stack_trace TEXT,
  error_hash VARCHAR(64),                   -- For deduplication
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  resolution_type VARCHAR(30),              -- quick_fix, full_sd, duplicate, not_a_bug

  -- ENHANCEMENT-SPECIFIC (nullable for issues)
  value_estimate VARCHAR(20) CHECK (value_estimate IN ('high', 'medium', 'low')),
  effort_estimate VARCHAR(20) CHECK (effort_estimate IN ('small', 'medium', 'large')),
  votes INTEGER DEFAULT 0,                  -- For future voting feature
  use_case TEXT,                            -- "As a X, I want Y so that Z"

  -- CONVERSION TRACKING
  original_type VARCHAR(20),                -- If converted, what was it originally?
  converted_at TIMESTAMPTZ,                 -- When was it converted?
  conversion_reason TEXT,                   -- Why was it converted?

  -- Triage
  triaged_at TIMESTAMPTZ,                   -- When feedback was triaged
  triaged_by VARCHAR(100),                  -- Who triaged (user or 'ai_auto')
  snoozed_until TIMESTAMPTZ,                -- Hidden until this time
  ignore_pattern VARCHAR(255),              -- If set, similar items auto-ignored
  ai_triage_suggestion JSONB,               -- AI suggestions: {duplicate_of, pattern_match, severity_rec}

  -- Resolution
  assigned_to VARCHAR(100),
  resolution_sd_id VARCHAR(50),             -- If resolved via SD
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- =============================================================================
-- INDEXES: feedback table
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_source_app ON feedback(source_application);
CREATE INDEX IF NOT EXISTS idx_feedback_source_type ON feedback(source_type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_sd_id ON feedback(sd_id);
CREATE INDEX IF NOT EXISTS idx_feedback_error_hash ON feedback(error_hash) WHERE error_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_severity ON feedback(severity) WHERE type = 'issue';
CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback(priority);
CREATE INDEX IF NOT EXISTS idx_feedback_snoozed ON feedback(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_value ON feedback(value_estimate) WHERE type = 'enhancement';

-- Partial indexes for type-specific queries
CREATE INDEX IF NOT EXISTS idx_feedback_issues ON feedback(created_at DESC) WHERE type = 'issue';
CREATE INDEX IF NOT EXISTS idx_feedback_enhancements ON feedback(created_at DESC) WHERE type = 'enhancement';

-- =============================================================================
-- TRIGGER: update_updated_at for feedback
-- =============================================================================

CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_feedback_updated_at ON feedback;
CREATE TRIGGER trigger_update_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

-- =============================================================================
-- RLS: feedback table
-- =============================================================================

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS select_feedback_policy ON feedback;
DROP POLICY IF EXISTS insert_feedback_policy ON feedback;
DROP POLICY IF EXISTS update_feedback_policy ON feedback;
DROP POLICY IF EXISTS delete_feedback_policy ON feedback;

-- authenticated: SELECT only
CREATE POLICY select_feedback_policy ON feedback
  FOR SELECT TO authenticated
  USING (true);

-- service_role: ALL
CREATE POLICY insert_feedback_policy ON feedback
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY update_feedback_policy ON feedback
  FOR UPDATE TO service_role
  USING (true);

CREATE POLICY delete_feedback_policy ON feedback
  FOR DELETE TO service_role
  USING (true);

-- =============================================================================
-- TABLE: releases (Release Planning)
-- =============================================================================

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_id UUID,                          -- NULL for EHG global
  version VARCHAR(50),                      -- 'v2.1.0'
  name VARCHAR(100),                        -- 'The Dark Mode Update'

  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'shipped')),
  target_date DATE,
  shipped_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES: releases table
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_releases_venture ON releases(venture_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_releases_target ON releases(target_date);

-- =============================================================================
-- TRIGGER: update_updated_at for releases
-- =============================================================================

CREATE OR REPLACE FUNCTION update_releases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_releases_updated_at ON releases;
CREATE TRIGGER trigger_update_releases_updated_at
  BEFORE UPDATE ON releases
  FOR EACH ROW
  EXECUTE FUNCTION update_releases_updated_at();

-- =============================================================================
-- RLS: releases table
-- =============================================================================

ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS select_releases_policy ON releases;
DROP POLICY IF EXISTS insert_releases_policy ON releases;
DROP POLICY IF EXISTS update_releases_policy ON releases;
DROP POLICY IF EXISTS delete_releases_policy ON releases;

-- authenticated: SELECT only
CREATE POLICY select_releases_policy ON releases
  FOR SELECT TO authenticated
  USING (true);

-- service_role: ALL
CREATE POLICY insert_releases_policy ON releases
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY update_releases_policy ON releases
  FOR UPDATE TO service_role
  USING (true);

CREATE POLICY delete_releases_policy ON releases
  FOR DELETE TO service_role
  USING (true);

-- =============================================================================
-- TABLE: feedback_sd_map (Junction Table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS feedback_sd_map (
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE,
  sd_id VARCHAR(100) REFERENCES strategic_directives_v2(id),

  relationship_type VARCHAR(20) DEFAULT 'addresses' CHECK (relationship_type IN ('addresses', 'partially_addresses', 'related')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (feedback_id, sd_id)
);

-- =============================================================================
-- ALTER: strategic_directives_v2 (add release linkage)
-- =============================================================================

-- Check if column exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
      AND column_name = 'target_release_id'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN target_release_id UUID REFERENCES releases(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sd_release ON strategic_directives_v2(target_release_id);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- 1. Created feedback table with type discriminator (issue/enhancement)
-- 2. Created releases table for bundling enhancements into versioned releases
-- 3. Created feedback_sd_map junction table for many-to-many SD linking
-- 4. Added target_release_id to strategic_directives_v2
-- 5. Created 14 indexes (12 on feedback, 3 on releases)
-- 6. Enabled RLS with authenticated SELECT, service_role ALL
-- 7. Added update_updated_at triggers for both tables
