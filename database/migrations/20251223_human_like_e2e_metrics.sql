-- Human-Like E2E Testing Metrics
-- Tracks test runs, performance, and improvement opportunities
-- Enables retrospective analysis and continuous improvement

-- Test run metrics (aggregate per run)
CREATE TABLE IF NOT EXISTS human_like_e2e_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE,  -- EVP-timestamp-hash format

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Test counts
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  timed_out INTEGER NOT NULL DEFAULT 0,

  -- Category breakdown
  accessibility_passed INTEGER DEFAULT 0,
  accessibility_failed INTEGER DEFAULT 0,
  chaos_passed INTEGER DEFAULT 0,
  chaos_failed INTEGER DEFAULT 0,
  visual_passed INTEGER DEFAULT 0,
  visual_failed INTEGER DEFAULT 0,
  ux_eval_passed INTEGER DEFAULT 0,
  ux_eval_failed INTEGER DEFAULT 0,

  -- Performance metrics
  avg_test_duration_ms INTEGER,
  slowest_test_name TEXT,
  slowest_test_duration_ms INTEGER,

  -- Environment
  target_url TEXT NOT NULL,
  venture_name TEXT,
  stringency TEXT DEFAULT 'standard',
  ci_run BOOLEAN DEFAULT false,
  branch TEXT,
  commit_sha TEXT,

  -- Retrospective
  retrospective_generated BOOLEAN DEFAULT false,
  improvement_suggestions JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual test metrics (for trend analysis)
CREATE TABLE IF NOT EXISTS human_like_e2e_test_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES human_like_e2e_runs(run_id) ON DELETE CASCADE,

  test_name TEXT NOT NULL,
  test_file TEXT NOT NULL,
  category TEXT NOT NULL,  -- 'accessibility', 'chaos', 'visual', 'ux_eval', 'keyboard'

  status TEXT NOT NULL,  -- 'passed', 'failed', 'skipped', 'timedOut'
  duration_ms INTEGER,

  -- Failure details
  error_message TEXT,
  error_type TEXT,  -- 'assertion', 'timeout', 'crash', 'a11y_violation'

  -- For accessibility tests
  violation_count INTEGER,
  critical_count INTEGER,
  serious_count INTEGER,

  -- For flakiness tracking
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Improvement opportunities (captured from retrospectives)
CREATE TABLE IF NOT EXISTS human_like_e2e_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source_run_id TEXT REFERENCES human_like_e2e_runs(run_id),

  -- Improvement details
  category TEXT NOT NULL,  -- 'speed', 'accuracy', 'coverage', 'stability', 'dx'
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'high', 'medium', 'low'
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Tracking
  status TEXT NOT NULL DEFAULT 'identified',  -- 'identified', 'in_progress', 'implemented', 'wont_fix'
  implemented_at TIMESTAMPTZ,
  implemented_by TEXT,

  -- Impact measurement
  before_metric JSONB,  -- e.g., {"avg_duration_ms": 15000}
  after_metric JSONB,   -- e.g., {"avg_duration_ms": 8000}
  improvement_percent NUMERIC(5,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_e2e_runs_started ON human_like_e2e_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_e2e_runs_venture ON human_like_e2e_runs(venture_name);
CREATE INDEX IF NOT EXISTS idx_e2e_test_metrics_run ON human_like_e2e_test_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_e2e_test_metrics_name ON human_like_e2e_test_metrics(test_name);
CREATE INDEX IF NOT EXISTS idx_e2e_improvements_status ON human_like_e2e_improvements(status);

-- View for trend analysis
CREATE OR REPLACE VIEW human_like_e2e_trends AS
SELECT
  date_trunc('day', started_at) AS run_date,
  venture_name,
  COUNT(*) AS runs,
  AVG(duration_ms) AS avg_duration_ms,
  AVG(passed::numeric / NULLIF(total_tests, 0) * 100) AS avg_pass_rate,
  SUM(failed) AS total_failures,
  SUM(timed_out) AS total_timeouts
FROM human_like_e2e_runs
WHERE completed_at IS NOT NULL
GROUP BY date_trunc('day', started_at), venture_name
ORDER BY run_date DESC;

-- View for flaky test detection
CREATE OR REPLACE VIEW human_like_e2e_flaky_tests AS
SELECT
  test_name,
  test_file,
  category,
  COUNT(*) AS total_runs,
  SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passes,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failures,
  SUM(CASE WHEN status = 'timedOut' THEN 1 ELSE 0 END) AS timeouts,
  ROUND(
    SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END)::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS pass_rate,
  AVG(duration_ms) AS avg_duration_ms
FROM human_like_e2e_test_metrics
GROUP BY test_name, test_file, category
HAVING COUNT(*) >= 3  -- Only tests with enough data
ORDER BY pass_rate ASC;  -- Most flaky first

COMMENT ON TABLE human_like_e2e_runs IS 'Aggregate metrics for each Human-Like E2E test run';
COMMENT ON TABLE human_like_e2e_test_metrics IS 'Individual test metrics for trend analysis';
COMMENT ON TABLE human_like_e2e_improvements IS 'Improvement opportunities identified from retrospectives';
