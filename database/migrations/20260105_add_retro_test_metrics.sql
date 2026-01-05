-- LEO Protocol v4.4.2: Add test coverage metrics to retrospectives
-- SD-LEO-TESTING-GOVERNANCE-001D: Test Coverage Metrics in Retrospectives
--
-- Evidence: 4 retrospectives requested test coverage metrics
-- NO FK to test_runs currently, quality_score has no correlation with test metrics

-- Add FK to test_runs
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS test_run_id UUID REFERENCES test_runs(id);

-- Add quantitative test metrics
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS test_pass_rate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS test_total_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_passed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_failed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_skipped_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_evidence_freshness TEXT
  CHECK (test_evidence_freshness IN ('FRESH', 'AGING', 'STALE', NULL)),
ADD COLUMN IF NOT EXISTS story_coverage_percent NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS stories_with_tests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stories_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_verdict VARCHAR(20)
  CHECK (test_verdict IN ('PASS', 'FAIL', 'PARTIAL', 'ERROR', NULL));

-- Index for test_run lookups
CREATE INDEX IF NOT EXISTS idx_retrospectives_test_run_id
ON retrospectives(test_run_id) WHERE test_run_id IS NOT NULL;

-- Composite index for metrics queries
CREATE INDEX IF NOT EXISTS idx_retrospectives_test_metrics
ON retrospectives(sd_id, test_pass_rate, test_verdict)
WHERE test_run_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN retrospectives.test_run_id IS
  'FK to test_runs for quantitative metrics. Populated by RETRO sub-agent.';
COMMENT ON COLUMN retrospectives.test_pass_rate IS
  'Pass rate from linked test_run (0-100)';
COMMENT ON COLUMN retrospectives.story_coverage_percent IS
  'Percentage of user stories with passing tests';
COMMENT ON COLUMN retrospectives.test_verdict IS
  'Test verdict from test_runs (PASS, FAIL, PARTIAL, ERROR)';
