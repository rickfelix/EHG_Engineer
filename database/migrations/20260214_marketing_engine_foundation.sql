-- Marketing Engine Foundation Migration
-- SD-EVA-FEAT-MARKETING-FOUNDATION-001
-- Creates 8 marketing tables with RLS policies, indexes, and generated columns

-- ============================================================
-- 1. marketing_channels - Platform configuration per venture
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                    -- 'x', 'bluesky', 'youtube', 'mastodon', 'threads', 'linkedin', 'tiktok'
  integration_type TEXT NOT NULL DEFAULT 'direct', -- 'direct' or 'aggregator' (Late)
  credentials JSONB NOT NULL DEFAULT '{}',   -- encrypted API keys per platform
  rate_limits JSONB NOT NULL DEFAULT '{}',   -- { posts_per_window: 50, window_minutes: 15 }
  status TEXT NOT NULL DEFAULT 'inactive',   -- 'active', 'inactive', 'suspended'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, platform)
);

CREATE INDEX idx_marketing_channels_venture ON marketing_channels(venture_id);

-- ============================================================
-- 2. marketing_content - Content master records
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,                -- 'social_post', 'email', 'ad'
  channel_family TEXT NOT NULL DEFAULT 'social', -- 'social', 'email', 'paid'
  concept_tags TEXT[] DEFAULT '{}',
  lifecycle_state TEXT NOT NULL DEFAULT 'IDEATE', -- IDEATE -> GENERATE -> REVIEW -> SCHEDULE -> DISPATCH -> MEASURE -> OPTIMIZE
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_content_venture ON marketing_content(venture_id);
CREATE INDEX idx_marketing_content_lifecycle ON marketing_content(lifecycle_state);
CREATE INDEX idx_marketing_content_type ON marketing_content(content_type);

-- ============================================================
-- 3. marketing_content_variants - A/B variant tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_content_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL,                 -- 'headline_a', 'headline_b', 'image_warm', 'image_cool'
  headline TEXT,
  body TEXT,
  cta TEXT,                                  -- call to action
  asset_image_key TEXT,                      -- storage bucket path
  asset_video_key TEXT,                      -- storage bucket path
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_variants_content ON marketing_content_variants(content_id);

-- ============================================================
-- 4. marketing_campaigns - Campaign grouping
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',      -- 'draft', 'active', 'paused', 'completed'
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  objective TEXT,                            -- 'awareness', 'engagement', 'conversion'
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_campaigns_venture ON marketing_campaigns(venture_id);
CREATE INDEX idx_marketing_campaigns_status ON marketing_campaigns(status);

-- ============================================================
-- 5. campaign_content - Junction table linking campaigns to content
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  dispatch_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'scheduled', 'dispatched', 'failed'
  idempotency_key TEXT,                      -- {venture_id}:{content_id}:{platform}:{timestamp}
  external_post_id TEXT,                     -- platform-specific post ID
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX idx_campaign_content_campaign ON campaign_content(campaign_id);
CREATE INDEX idx_campaign_content_content ON campaign_content(content_id);
CREATE INDEX idx_campaign_content_status ON campaign_content(dispatch_status);

-- ============================================================
-- 6. channel_budgets - Per-venture per-platform budget caps
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  monthly_budget_cents INTEGER NOT NULL DEFAULT 5000, -- $50 default
  daily_limit_cents INTEGER,                 -- optional daily cap
  daily_stop_loss_multiplier NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  current_month_spend_cents INTEGER NOT NULL DEFAULT 0,
  current_day_spend_cents INTEGER NOT NULL DEFAULT 0,
  budget_month TEXT,                         -- 'YYYY-MM' for tracking resets
  status TEXT NOT NULL DEFAULT 'active',     -- 'active', 'paused', 'exceeded'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, platform)
);

CREATE INDEX idx_channel_budgets_venture ON channel_budgets(venture_id);

-- ============================================================
-- 7. daily_rollups - Pre-aggregated daily metrics
-- NOTE: Uses UUID PK + unique index with COALESCE for nullable composite key
-- (PostgreSQL does not support COALESCE expressions in PRIMARY KEY constraints)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rollup_date DATE NOT NULL,
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content_id UUID REFERENCES marketing_content(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES marketing_content_variants(id) ON DELETE SET NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  -- Generated columns for rates
  engagement_rate NUMERIC(8,6) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN engagements::NUMERIC / impressions ELSE 0 END
  ) STORED,
  ctr NUMERIC(8,6) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN clicks::NUMERIC / impressions ELSE 0 END
  ) STORED,
  conversion_rate NUMERIC(8,6) GENERATED ALWAYS AS (
    CASE WHEN clicks > 0 THEN conversions::NUMERIC / clicks ELSE 0 END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for dedup using COALESCE to handle nullable content_id/variant_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_rollups_unique_key
  ON daily_rollups (rollup_date, venture_id, platform,
    COALESCE(content_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX idx_daily_rollups_venture_date ON daily_rollups(venture_id, rollup_date);
CREATE INDEX idx_daily_rollups_platform ON daily_rollups(platform);

-- ============================================================
-- 8. marketing_attribution - UTM attribution tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  content_id UUID REFERENCES marketing_content(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES marketing_content_variants(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  event_type TEXT NOT NULL,                  -- 'impression', 'click', 'engagement', 'conversion'
  event_value JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attribution_venture ON marketing_attribution(venture_id);
CREATE INDEX idx_attribution_occurred ON marketing_attribution(occurred_at);
CREATE INDEX idx_attribution_event_type ON marketing_attribution(event_type);
CREATE INDEX idx_attribution_content ON marketing_attribution(content_id);

-- ============================================================
-- RLS Policies - All tables restricted by venture_id
-- ============================================================
ALTER TABLE marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_attribution ENABLE ROW LEVEL SECURITY;

-- Service role bypass for all tables (server-side access)
CREATE POLICY "service_role_all_marketing_channels" ON marketing_channels
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_marketing_content" ON marketing_content
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_marketing_content_variants" ON marketing_content_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_marketing_campaigns" ON marketing_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_content" ON campaign_content
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_channel_budgets" ON channel_budgets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_daily_rollups" ON daily_rollups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_marketing_attribution" ON marketing_attribution
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can only see their venture's data
-- NOTE: ventures table uses created_by (text) as owner column, not owner_id
CREATE POLICY "venture_read_marketing_channels" ON marketing_channels
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

CREATE POLICY "venture_read_marketing_content" ON marketing_content
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

CREATE POLICY "venture_read_marketing_content_variants" ON marketing_content_variants
  FOR SELECT TO authenticated
  USING (content_id IN (
    SELECT id FROM marketing_content WHERE venture_id IN (
      SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
    )
  ));

CREATE POLICY "venture_read_marketing_campaigns" ON marketing_campaigns
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

CREATE POLICY "venture_read_campaign_content" ON campaign_content
  FOR SELECT TO authenticated
  USING (campaign_id IN (
    SELECT id FROM marketing_campaigns WHERE venture_id IN (
      SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
    )
  ));

CREATE POLICY "venture_read_channel_budgets" ON channel_budgets
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

CREATE POLICY "venture_read_daily_rollups" ON daily_rollups
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

CREATE POLICY "venture_read_marketing_attribution" ON marketing_attribution
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

-- ============================================================
-- Updated_at trigger function (reuse if exists)
-- ============================================================
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketing_channels_updated
  BEFORE UPDATE ON marketing_channels
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_content_updated
  BEFORE UPDATE ON marketing_content
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_marketing_campaigns_updated
  BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trg_channel_budgets_updated
  BEFORE UPDATE ON channel_budgets
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();
