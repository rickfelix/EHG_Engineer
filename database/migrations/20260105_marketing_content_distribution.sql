-- Migration: Marketing Content Distribution
-- SD-MARKETING-AUTOMATION-001
-- Date: 2026-01-05
-- Purpose: Add tables for content distribution workflow

-- ============================================================================
-- STEP 1: Distribution Channels
-- ============================================================================

CREATE TABLE IF NOT EXISTS distribution_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  channel_type VARCHAR(50) NOT NULL CHECK (channel_type IN ('social', 'email', 'web', 'other')),
  platform VARCHAR(50) CHECK (platform IN ('linkedin', 'twitter', 'facebook', 'instagram', 'email', 'website', 'other')),
  config JSONB DEFAULT '{}',
  utm_defaults JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default channels
INSERT INTO distribution_channels (name, channel_type, platform, utm_defaults) VALUES
  ('LinkedIn', 'social', 'linkedin', '{"utm_source": "linkedin", "utm_medium": "social"}'),
  ('X/Twitter', 'social', 'twitter', '{"utm_source": "twitter", "utm_medium": "social"}'),
  ('Facebook', 'social', 'facebook', '{"utm_source": "facebook", "utm_medium": "social"}'),
  ('Instagram', 'social', 'instagram', '{"utm_source": "instagram", "utm_medium": "social"}')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 2: Content Distribution Queue
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  content_id UUID REFERENCES generated_content(id) ON DELETE SET NULL,

  -- Content details (copy from generated_content for quick access)
  title VARCHAR(255) NOT NULL,
  content_body TEXT NOT NULL,
  content_type VARCHAR(50),

  -- Target platforms (array of channel IDs)
  target_channels UUID[] DEFAULT '{}',

  -- Queue status
  status VARCHAR(30) NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'in_review',
    'approved',
    'rejected',
    'scheduled',
    'ready_to_post',
    'posted',
    'failed'
  )),

  -- Review tracking
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ,

  -- UTM tracking
  utm_campaign VARCHAR(100),
  utm_content VARCHAR(100),

  -- Metadata
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- STEP 3: Distribution History
-- ============================================================================

CREATE TABLE IF NOT EXISTS distribution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  queue_item_id UUID REFERENCES marketing_content_queue(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES distribution_channels(id) ON DELETE SET NULL,

  -- Distribution details
  content_title VARCHAR(255),
  content_snippet TEXT,
  platform VARCHAR(50) NOT NULL,

  -- Status tracking
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'posted',
    'scheduled',
    'failed',
    'deleted'
  )),

  -- Tracking
  tracking_url TEXT,
  utm_source VARCHAR(50),
  utm_medium VARCHAR(50),
  utm_campaign VARCHAR(100),
  utm_content VARCHAR(100),

  -- Timing
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,

  -- Metrics (updated via analytics integration)
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,

  -- Error tracking
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  posted_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- STEP 4: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mcq_venture ON marketing_content_queue(venture_id);
CREATE INDEX IF NOT EXISTS idx_mcq_status ON marketing_content_queue(status);
CREATE INDEX IF NOT EXISTS idx_mcq_scheduled ON marketing_content_queue(scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dh_venture ON distribution_history(venture_id);
CREATE INDEX IF NOT EXISTS idx_dh_platform ON distribution_history(platform);
CREATE INDEX IF NOT EXISTS idx_dh_posted_at ON distribution_history(posted_at) WHERE posted_at IS NOT NULL;

-- ============================================================================
-- STEP 5: RLS Policies
-- ============================================================================

ALTER TABLE distribution_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_history ENABLE ROW LEVEL SECURITY;

-- Distribution channels: readable by all authenticated, writable by service role
CREATE POLICY "distribution_channels_read" ON distribution_channels
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "distribution_channels_admin" ON distribution_channels
  FOR ALL TO service_role
  USING (true);

-- Marketing content queue: venture-scoped access
CREATE POLICY "mcq_venture_access" ON marketing_content_queue
  FOR ALL TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      JOIN companies c ON v.company_id = c.id
      WHERE c.id IN (
        SELECT company_id FROM company_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "mcq_service_role" ON marketing_content_queue
  FOR ALL TO service_role
  USING (true);

-- Distribution history: venture-scoped access
CREATE POLICY "dh_venture_access" ON distribution_history
  FOR ALL TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      JOIN companies c ON v.company_id = c.id
      WHERE c.id IN (
        SELECT company_id FROM company_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "dh_service_role" ON distribution_history
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- STEP 6: Helper Functions
-- ============================================================================

-- Generate UTM parameters for a distribution
CREATE OR REPLACE FUNCTION generate_utm_params(
  p_venture_id UUID,
  p_channel_id UUID,
  p_campaign VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_defaults JSONB;
  venture_name VARCHAR;
  result JSONB;
BEGIN
  -- Get channel defaults
  SELECT utm_defaults INTO channel_defaults
  FROM distribution_channels
  WHERE id = p_channel_id;

  -- Get venture name for campaign
  SELECT name INTO venture_name
  FROM ventures
  WHERE id = p_venture_id;

  -- Build UTM parameters
  result := jsonb_build_object(
    'utm_source', COALESCE(channel_defaults->>'utm_source', 'direct'),
    'utm_medium', COALESCE(channel_defaults->>'utm_medium', 'social'),
    'utm_campaign', COALESCE(p_campaign, LOWER(REGEXP_REPLACE(venture_name, '[^a-zA-Z0-9]', '-', 'g'))),
    'utm_content', TO_CHAR(NOW(), 'YYYYMMDD')
  );

  RETURN result;
END;
$$;

-- Get queue summary for a venture
CREATE OR REPLACE FUNCTION get_content_queue_summary(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pending_review', COUNT(*) FILTER (WHERE status = 'pending_review'),
    'approved', COUNT(*) FILTER (WHERE status = 'approved'),
    'ready_to_post', COUNT(*) FILTER (WHERE status = 'ready_to_post'),
    'posted', COUNT(*) FILTER (WHERE status = 'posted'),
    'total', COUNT(*)
  ) INTO result
  FROM marketing_content_queue
  WHERE venture_id = p_venture_id;

  RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_utm_params(UUID, UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_utm_params(UUID, UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION get_content_queue_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_content_queue_summary(UUID) TO service_role;

-- ============================================================================
-- STEP 7: Validation
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Marketing Content Distribution Schema - Applied';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - distribution_channels (4 default channels)';
  RAISE NOTICE '  - marketing_content_queue';
  RAISE NOTICE '  - distribution_history';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions:';
  RAISE NOTICE '  - generate_utm_params(venture_id, channel_id, campaign)';
  RAISE NOTICE '  - get_content_queue_summary(venture_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS: Enabled with venture-scoped access';
END $$;
