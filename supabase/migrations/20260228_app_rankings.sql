-- App Rankings table for ranking data pipeline
-- Stores normalized app store ranking data from multiple sources
-- Part of SD-LEO-INFRA-IMPLEMENT-APP-RANKINGS-001

CREATE TABLE IF NOT EXISTS app_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID,
  app_name TEXT NOT NULL,
  developer TEXT,
  app_url TEXT NOT NULL,
  website_url TEXT,
  category TEXT,
  chart_position INTEGER,
  chart_type TEXT,
  source TEXT NOT NULL CHECK (source IN ('apple_appstore', 'google_play', 'product_hunt')),
  rating NUMERIC(3,1),
  review_count INTEGER,
  installs_range TEXT,
  vote_count INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_app_rankings_source
  ON app_rankings (source);

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_app_rankings_category
  ON app_rankings (category);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_app_rankings_created
  ON app_rankings (created_at DESC);

-- RLS policies
ALTER TABLE app_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access on app_rankings"
  ON app_rankings FOR ALL
  USING (true)
  WITH CHECK (true);
