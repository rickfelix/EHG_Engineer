-- LEO Protocol v4.1.2 - Agentic Review Integration Schema
-- Purpose: Store PR review results, metrics, and link to LEO handoffs
-- Date: 2025-01-15

-- Core PR review storage
CREATE TABLE IF NOT EXISTS agentic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number INTEGER NOT NULL,
  sd_id TEXT REFERENCES strategic_directives_v2(id),
  prd_id TEXT,
  phase TEXT CHECK (phase IN ('EXEC', 'PLAN_VERIFY')),
  status TEXT CHECK (status IN ('pending', 'passed', 'failed', 'warning')),

  -- Review results
  checks_passed INTEGER DEFAULT 0,
  checks_failed INTEGER DEFAULT 0,
  checks_warning INTEGER DEFAULT 0,
  checks JSONB DEFAULT '{}',

  -- Sub-agent data
  sub_agents_activated TEXT[],
  agent_findings JSONB DEFAULT '{}',

  -- Metrics
  review_time_ms INTEGER,
  false_positives INTEGER DEFAULT 0,

  -- GitHub metadata
  github_check_id TEXT,
  commit_sha TEXT,
  branch TEXT,
  pr_title TEXT,
  pr_author TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Metrics tracking for analytics
CREATE TABLE IF NOT EXISTS pr_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE DEFAULT CURRENT_DATE UNIQUE,
  total_prs INTEGER DEFAULT 0,
  compliant_prs INTEGER DEFAULT 0,
  non_compliant_prs INTEGER DEFAULT 0,
  avg_review_time_ms INTEGER,
  false_positive_rate DECIMAL(5,2),
  sub_agent_activations JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agentic_reviews_pr ON agentic_reviews(pr_number);
CREATE INDEX IF NOT EXISTS idx_agentic_reviews_sd ON agentic_reviews(sd_id);
CREATE INDEX IF NOT EXISTS idx_agentic_reviews_status ON agentic_reviews(status);
CREATE INDEX IF NOT EXISTS idx_agentic_reviews_created ON agentic_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_metrics_date ON pr_metrics(date DESC);

-- Link reviews to handoffs
ALTER TABLE leo_handoff_tracking
ADD COLUMN IF NOT EXISTS agentic_review_id UUID REFERENCES agentic_reviews(id),
ADD COLUMN IF NOT EXISTS pr_number INTEGER,
ADD COLUMN IF NOT EXISTS github_check_id TEXT;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agentic_reviews_updated_at
  BEFORE UPDATE ON agentic_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for security
ALTER TABLE agentic_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_metrics ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read reviews
CREATE POLICY "Allow authenticated read agentic_reviews"
  ON agentic_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to manage reviews
CREATE POLICY "Allow service role all agentic_reviews"
  ON agentic_reviews FOR ALL
  TO service_role
  USING (true);

-- Allow authenticated users to read metrics
CREATE POLICY "Allow authenticated read pr_metrics"
  ON pr_metrics FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to manage metrics
CREATE POLICY "Allow service role all pr_metrics"
  ON pr_metrics FOR ALL
  TO service_role
  USING (true);

-- Function to calculate daily metrics
CREATE OR REPLACE FUNCTION calculate_pr_metrics_for_date(target_date DATE)
RETURNS void AS $$
DECLARE
  v_total_prs INTEGER;
  v_compliant_prs INTEGER;
  v_avg_review_time INTEGER;
  v_false_positive_rate DECIMAL(5,2);
BEGIN
  -- Calculate metrics for the given date
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE sd_id IS NOT NULL),
    AVG(review_time_ms)::INTEGER,
    (AVG(false_positives) * 100)::DECIMAL(5,2)
  INTO
    v_total_prs,
    v_compliant_prs,
    v_avg_review_time,
    v_false_positive_rate
  FROM agentic_reviews
  WHERE DATE(created_at) = target_date;

  -- Insert or update metrics
  INSERT INTO pr_metrics (
    date,
    total_prs,
    compliant_prs,
    non_compliant_prs,
    avg_review_time_ms,
    false_positive_rate
  ) VALUES (
    target_date,
    COALESCE(v_total_prs, 0),
    COALESCE(v_compliant_prs, 0),
    COALESCE(v_total_prs - v_compliant_prs, 0),
    v_avg_review_time,
    v_false_positive_rate
  )
  ON CONFLICT (date) DO UPDATE SET
    total_prs = EXCLUDED.total_prs,
    compliant_prs = EXCLUDED.compliant_prs,
    non_compliant_prs = EXCLUDED.non_compliant_prs,
    avg_review_time_ms = EXCLUDED.avg_review_time_ms,
    false_positive_rate = EXCLUDED.false_positive_rate;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for the functions
GRANT EXECUTE ON FUNCTION calculate_pr_metrics_for_date(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO authenticated;