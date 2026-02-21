-- Migration: Create eva_claude_code_intake table + extend related constraints
-- SD: (Release Monitor Pipeline)
-- Date: 2026-02-21

-- ============================================================================
-- 1. Create eva_claude_code_intake table
-- Pattern: eva_todoist_intake / eva_youtube_intake
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_claude_code_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- GitHub release identity (dedup key)
  github_release_id BIGINT NOT NULL UNIQUE,
  tag_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  release_url TEXT,
  published_at TIMESTAMPTZ,
  is_prerelease BOOLEAN DEFAULT false,

  -- Analysis results (populated by release-analyzer.js)
  relevance_score NUMERIC(3,2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  impact_areas JSONB DEFAULT '[]'::jsonb,
  analysis_summary TEXT,
  workflow_improvements JSONB DEFAULT '[]'::jsonb,
  recommendation TEXT CHECK (recommendation IN ('adopt', 'evaluate', 'monitor', 'skip')),

  -- Forward links
  feedback_id UUID,
  approval_request_id UUID,
  brainstorm_session_id UUID,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'evaluating', 'notified', 'approved', 'rejected', 'skipped', 'processed', 'error')),

  -- Raw API response
  raw_data JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eva_cc_intake_status
  ON eva_claude_code_intake(status);

CREATE INDEX IF NOT EXISTS idx_eva_cc_intake_pending
  ON eva_claude_code_intake(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_eva_cc_intake_tag
  ON eva_claude_code_intake(tag_name);

CREATE INDEX IF NOT EXISTS idx_eva_cc_intake_published
  ON eva_claude_code_intake(published_at DESC);

-- Enable RLS
ALTER TABLE eva_claude_code_intake ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "manage_eva_claude_code_intake" ON eva_claude_code_intake
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated: read-only
CREATE POLICY "select_eva_claude_code_intake" ON eva_claude_code_intake
  FOR SELECT TO authenticated
  USING (true);

-- Updated_at trigger (reuse existing function if available, else create)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_eva_intake_updated_at'
  ) THEN
    CREATE FUNCTION update_eva_intake_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

CREATE TRIGGER trg_eva_claude_code_intake_updated
  BEFORE UPDATE ON eva_claude_code_intake
  FOR EACH ROW
  EXECUTE FUNCTION update_eva_intake_updated_at();

-- ============================================================================
-- 2. Extend feedback.source_type CHECK to include 'claude_code_intake'
-- ============================================================================

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;

ALTER TABLE feedback ADD CONSTRAINT feedback_source_type_check
  CHECK (source_type IN (
    'manual_feedback',
    'auto_capture',
    'uat_failure',
    'error_capture',
    'uncaught_exception',
    'unhandled_rejection',
    'manual_capture',
    'todoist_intake',
    'youtube_intake',
    'claude_code_intake'
  ));

-- ============================================================================
-- 3. Extend chairman_notifications.notification_type CHECK
-- ============================================================================

ALTER TABLE chairman_notifications DROP CONSTRAINT IF EXISTS chairman_notifications_notification_type_check;

ALTER TABLE chairman_notifications ADD CONSTRAINT chairman_notifications_notification_type_check
  CHECK (notification_type IN (
    'immediate',
    'daily_digest',
    'weekly_summary',
    'telegram_vision_score',
    'telegram_release_monitor'
  ));

-- ============================================================================
-- 4. Extend chairman_approval_requests for non-venture requests
-- ============================================================================

-- Allow NULL venture_id for system-level requests (e.g., release enhancements)
ALTER TABLE chairman_approval_requests ALTER COLUMN venture_id DROP NOT NULL;

-- Extend request_type CHECK
ALTER TABLE chairman_approval_requests DROP CONSTRAINT IF EXISTS chairman_approval_requests_request_type_check;

ALTER TABLE chairman_approval_requests ADD CONSTRAINT chairman_approval_requests_request_type_check
  CHECK (request_type::text = ANY (ARRAY[
    'valuation_approval',
    'substage_override',
    'exit_strategy_approval',
    'investor_approach',
    'kill_switch',
    'release_enhancement'
  ]::text[]));

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE eva_claude_code_intake IS 'Tracks Claude Code GitHub releases for automated monitoring and chairman approval pipeline';
COMMENT ON COLUMN eva_claude_code_intake.github_release_id IS 'GitHub API release ID — dedup key';
COMMENT ON COLUMN eva_claude_code_intake.relevance_score IS '0.0-1.0 score of how relevant this release is to EHG workflows';
COMMENT ON COLUMN eva_claude_code_intake.recommendation IS 'Analysis recommendation: adopt, evaluate, monitor, or skip';
COMMENT ON COLUMN eva_claude_code_intake.status IS 'Lifecycle: pending → evaluating → notified → approved/rejected/skipped → processed';

-- ============================================================================
-- Rollback SQL:
-- DROP TRIGGER IF EXISTS trg_eva_claude_code_intake_updated ON eva_claude_code_intake;
-- DROP POLICY IF EXISTS "select_eva_claude_code_intake" ON eva_claude_code_intake;
-- DROP POLICY IF EXISTS "manage_eva_claude_code_intake" ON eva_claude_code_intake;
-- DROP TABLE IF EXISTS eva_claude_code_intake;
--
-- -- Revert feedback constraint (remove claude_code_intake)
-- ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;
-- ALTER TABLE feedback ADD CONSTRAINT feedback_source_type_check
--   CHECK (source_type IN (
--     'manual_feedback', 'auto_capture', 'uat_failure',
--     'error_capture', 'uncaught_exception', 'unhandled_rejection',
--     'manual_capture', 'todoist_intake', 'youtube_intake'
--   ));
--
-- -- Revert notification_type constraint
-- ALTER TABLE chairman_notifications DROP CONSTRAINT IF EXISTS chairman_notifications_notification_type_check;
-- ALTER TABLE chairman_notifications ADD CONSTRAINT chairman_notifications_notification_type_check
--   CHECK (notification_type IN ('immediate', 'daily_digest', 'weekly_summary', 'telegram_vision_score'));
--
-- -- Revert approval request_type constraint + NOT NULL
-- ALTER TABLE chairman_approval_requests ALTER COLUMN venture_id SET NOT NULL;
-- ALTER TABLE chairman_approval_requests DROP CONSTRAINT IF EXISTS chairman_approval_requests_request_type_check;
-- ALTER TABLE chairman_approval_requests ADD CONSTRAINT chairman_approval_requests_request_type_check
--   CHECK (request_type::text = ANY (ARRAY[
--     'valuation_approval', 'substage_override', 'exit_strategy_approval',
--     'investor_approach', 'kill_switch'
--   ]::text[]));
-- ============================================================================
