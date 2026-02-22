-- Migration: Create app_rankings table
-- SD: SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001
-- Date: 2026-02-22
-- Purpose: Store scraped app ranking data from Apple App Store, Google Play, and Product Hunt
-- Supports upserts via (source, app_url) unique constraint and 7-day window queries via scraped_at index

-- Create the table
CREATE TABLE IF NOT EXISTS app_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification
  source TEXT NOT NULL
    CONSTRAINT app_rankings_source_check CHECK (source IN ('apple_appstore', 'google_play', 'product_hunt')),

  -- App metadata
  app_name TEXT NOT NULL,
  developer TEXT,
  app_url TEXT NOT NULL,
  website_url TEXT,
  description TEXT,
  category TEXT,

  -- Ranking data
  chart_position INTEGER,
  chart_type TEXT,  -- e.g., 'top-free', 'trending', 'top-grossing'

  -- Rating and popularity
  rating NUMERIC,
  review_count INTEGER,
  installs_range TEXT,   -- Google Play style: '1M+', '10M+'
  vote_count INTEGER,    -- Product Hunt upvotes

  -- Timestamps
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ

);

-- Unique constraint for upsert support (ON CONFLICT)
-- Prevents duplicate entries for the same app from the same source
ALTER TABLE app_rankings
  DROP CONSTRAINT IF EXISTS app_rankings_source_app_url_key;

ALTER TABLE app_rankings
  ADD CONSTRAINT app_rankings_source_app_url_key UNIQUE (source, app_url);

-- Index on scraped_at for 7-day window queries
-- e.g., WHERE scraped_at >= NOW() - INTERVAL '7 days'
CREATE INDEX IF NOT EXISTS idx_app_rankings_scraped_at
  ON app_rankings (scraped_at DESC);

-- Index on (source, category) for filtered queries
-- e.g., WHERE source = 'apple_appstore' AND category = 'Business'
CREATE INDEX IF NOT EXISTS idx_app_rankings_source_category
  ON app_rankings (source, category);

-- Table and column comments for documentation
COMMENT ON TABLE app_rankings IS 'Scraped app ranking data from Apple App Store, Google Play, and Product Hunt (SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001)';
COMMENT ON COLUMN app_rankings.source IS 'Data source: apple_appstore, google_play, or product_hunt';
COMMENT ON COLUMN app_rankings.chart_position IS 'Position in the chart/ranking list';
COMMENT ON COLUMN app_rankings.chart_type IS 'Type of chart: top-free, trending, top-grossing, etc.';
COMMENT ON COLUMN app_rankings.installs_range IS 'Google Play install range: 1M+, 10M+, etc.';
COMMENT ON COLUMN app_rankings.vote_count IS 'Product Hunt upvote count';
COMMENT ON COLUMN app_rankings.scraped_at IS 'Timestamp when the data was scraped from the source';

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_app_rankings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_rankings_updated_at ON app_rankings;
CREATE TRIGGER trg_app_rankings_updated_at
  BEFORE UPDATE ON app_rankings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_rankings_updated_at();

-- Rollback SQL (for reference):
-- DROP TRIGGER IF EXISTS trg_app_rankings_updated_at ON app_rankings;
-- DROP FUNCTION IF EXISTS update_app_rankings_updated_at();
-- DROP TABLE IF EXISTS app_rankings;
