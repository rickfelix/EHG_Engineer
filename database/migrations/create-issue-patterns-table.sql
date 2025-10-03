-- Create issue_patterns table for learning history system
-- This table stores recurring issues, their solutions, and success metrics

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create issue_patterns table
CREATE TABLE IF NOT EXISTS issue_patterns (
  -- Identity
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern_id VARCHAR(20) UNIQUE NOT NULL, -- PAT-001, PAT-002, etc.

  -- Classification
  category VARCHAR(100) NOT NULL, -- database, testing, deployment, etc.
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  issue_summary TEXT NOT NULL,

  -- Occurrence tracking
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_sd_id VARCHAR REFERENCES strategic_directives_v2(id),
  last_seen_sd_id VARCHAR REFERENCES strategic_directives_v2(id),

  -- Solutions and success metrics
  proven_solutions JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{
  --   solution: "Description of solution",
  --   times_applied: 5,
  --   times_successful: 4,
  --   success_rate: 80,
  --   avg_resolution_time_minutes: 15,
  --   first_used_sd_id: "uuid",
  --   found_via_search: true
  -- }]

  average_resolution_time INTERVAL,
  success_rate DECIMAL(5,2), -- 0-100%

  -- Prevention
  prevention_checklist JSONB DEFAULT '[]'::jsonb,
  -- Structure: ["Checklist item 1", "Checklist item 2"]

  related_sub_agents TEXT[], -- Which sub-agents can detect this

  -- Trend analysis
  trend VARCHAR(20) DEFAULT 'stable', -- increasing, stable, decreasing
  status VARCHAR(20) DEFAULT 'active', -- active, resolved, obsolete

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_issue_patterns_category ON issue_patterns(category);
CREATE INDEX IF NOT EXISTS idx_issue_patterns_status ON issue_patterns(status);
CREATE INDEX IF NOT EXISTS idx_issue_patterns_severity ON issue_patterns(severity);
CREATE INDEX IF NOT EXISTS idx_issue_patterns_trend ON issue_patterns(trend);
CREATE INDEX IF NOT EXISTS idx_issue_patterns_first_seen ON issue_patterns(first_seen_sd_id);
CREATE INDEX IF NOT EXISTS idx_issue_patterns_last_seen ON issue_patterns(last_seen_sd_id);

-- Full-text search index using pg_trgm for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_issue_patterns_summary_trgm
  ON issue_patterns USING gin(issue_summary gin_trgm_ops);

-- JSONB indexes for fast solution queries
CREATE INDEX IF NOT EXISTS idx_issue_patterns_solutions
  ON issue_patterns USING gin(proven_solutions);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_issue_patterns_status_category
  ON issue_patterns(status, category);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_issue_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_issue_patterns_updated_at ON issue_patterns;
CREATE TRIGGER trigger_update_issue_patterns_updated_at
  BEFORE UPDATE ON issue_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_issue_patterns_updated_at();

-- Helper function to search patterns by similarity
CREATE OR REPLACE FUNCTION search_issue_patterns(
  query_text TEXT,
  similarity_threshold REAL DEFAULT 0.3,
  result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  pattern_id VARCHAR,
  issue_summary TEXT,
  category VARCHAR,
  similarity_score REAL,
  occurrence_count INTEGER,
  success_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ip.pattern_id,
    ip.issue_summary,
    ip.category,
    similarity(ip.issue_summary, query_text) AS similarity_score,
    ip.occurrence_count,
    ip.success_rate
  FROM issue_patterns ip
  WHERE
    ip.status = 'active' AND
    similarity(ip.issue_summary, query_text) > similarity_threshold
  ORDER BY
    similarity(ip.issue_summary, query_text) DESC,
    ip.occurrence_count DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Add comment to table
COMMENT ON TABLE issue_patterns IS 'Learning history system: stores recurring issues, proven solutions, and success metrics for cross-session knowledge retention';

-- Grant permissions (adjust based on your RLS policies)
-- This is a basic permission setup - modify as needed for your security model
ALTER TABLE issue_patterns ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read patterns
CREATE POLICY "Allow authenticated users to read patterns"
  ON issue_patterns
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert/update patterns
-- In production, you might want to restrict this to specific roles
CREATE POLICY "Allow authenticated users to manage patterns"
  ON issue_patterns
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed some initial patterns from known issues documented in CLAUDE.md
INSERT INTO issue_patterns (pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, status, trend)
VALUES
  (
    'PAT-001',
    'database',
    'medium',
    'Database schema mismatch between TypeScript interfaces and Supabase tables',
    5,
    '[{
      "solution": "Run schema verification before TypeScript interface updates",
      "times_applied": 5,
      "times_successful": 5,
      "success_rate": 100,
      "avg_resolution_time_minutes": 15
    }]'::jsonb,
    '["Verify database schema before updating TypeScript types", "Run migration before code changes", "Check Supabase dashboard for table structure"]'::jsonb,
    'active',
    'decreasing'
  ),
  (
    'PAT-002',
    'testing',
    'medium',
    'Test path errors after component rename or refactoring',
    3,
    '[{
      "solution": "Update import paths in test files to match new component location",
      "times_applied": 3,
      "times_successful": 3,
      "success_rate": 100,
      "avg_resolution_time_minutes": 10
    }]'::jsonb,
    '["Update test imports when renaming components", "Use IDE refactoring tools", "Run tests after any file moves"]'::jsonb,
    'active',
    'stable'
  ),
  (
    'PAT-003',
    'security',
    'high',
    'RLS policy preventing data access even for authenticated users',
    3,
    '[{
      "solution": "Add auth.uid() check to RLS policy USING clause",
      "times_applied": 3,
      "times_successful": 3,
      "success_rate": 100,
      "avg_resolution_time_minutes": 20
    }]'::jsonb,
    '["Verify RLS policies include auth.uid() checks", "Test with authenticated user context", "Check policy applies to correct operations"]'::jsonb,
    'active',
    'decreasing'
  ),
  (
    'PAT-004',
    'build',
    'low',
    'Changes not reflecting after code update - server restart required',
    4,
    '[{
      "solution": "Kill dev server, rebuild client, restart server",
      "times_applied": 4,
      "times_successful": 4,
      "success_rate": 100,
      "avg_resolution_time_minutes": 5
    }]'::jsonb,
    '["Always restart dev server after code changes", "Run npm run build:client for UI changes", "Hard refresh browser (Ctrl+Shift+R)"]'::jsonb,
    'active',
    'stable'
  ),
  (
    'PAT-005',
    'code_structure',
    'medium',
    'Component import errors due to build output path mismatch',
    4,
    '[{
      "solution": "Verify build output paths match test expectations in vite.config.js",
      "times_applied": 4,
      "times_successful": 4,
      "success_rate": 100,
      "avg_resolution_time_minutes": 12
    }]'::jsonb,
    '["Check vite.config.js build output configuration", "Verify dist/ paths are correct", "Rebuild before testing"]'::jsonb,
    'active',
    'stable'
  ),
  (
    'PAT-006',
    'build',
    'medium',
    'Build output directory changed or missing after configuration updates',
    2,
    '[{
      "solution": "Verify dist/ path matches server static file configuration",
      "times_applied": 2,
      "times_successful": 2,
      "success_rate": 100,
      "avg_resolution_time_minutes": 15
    }]'::jsonb,
    '["Document build paths in README", "Keep vite.config.js and server.js paths in sync"]'::jsonb,
    'active',
    'stable'
  ),
  (
    'PAT-007',
    'protocol',
    'medium',
    'Sub-agent not triggering despite matching keyword in context',
    3,
    '[{
      "solution": "Verify trigger keyword in leo_sub_agent_triggers table and check activation_type",
      "times_applied": 3,
      "times_successful": 3,
      "success_rate": 100,
      "avg_resolution_time_minutes": 25
    }]'::jsonb,
    '["Check trigger keywords in database", "Verify sub-agent is active", "Review activation context requirements"]'::jsonb,
    'active',
    'stable'
  ),
  (
    'PAT-008',
    'deployment',
    'high',
    'CI/CD pipeline failures due to environment variable or dependency issues',
    2,
    '[{
      "solution": "Check GitHub Actions secrets and package.json dependencies",
      "times_applied": 2,
      "times_successful": 2,
      "success_rate": 100,
      "avg_resolution_time_minutes": 30
    }]'::jsonb,
    '["Verify all required secrets are set in GitHub", "Test locally with same Node version as CI", "Check package-lock.json is committed"]'::jsonb,
    'active',
    'stable'
  )
ON CONFLICT (pattern_id) DO NOTHING;

-- Create view for pattern statistics
CREATE OR REPLACE VIEW pattern_statistics AS
SELECT
  category,
  COUNT(*) as pattern_count,
  SUM(occurrence_count) as total_occurrences,
  AVG(success_rate) as avg_success_rate,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
  COUNT(CASE WHEN status = 'obsolete' THEN 1 END) as obsolete_count,
  COUNT(CASE WHEN trend = 'increasing' THEN 1 END) as increasing_count,
  COUNT(CASE WHEN trend = 'decreasing' THEN 1 END) as decreasing_count
FROM issue_patterns
GROUP BY category
ORDER BY total_occurrences DESC;

COMMENT ON VIEW pattern_statistics IS 'Aggregated statistics about issue patterns by category';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Issue patterns table created successfully';
  RAISE NOTICE '✅ Seeded 8 initial patterns from documented issues';
  RAISE NOTICE '✅ Search function and indexes created';
  RAISE NOTICE 'ℹ️  Test search: SELECT * FROM search_issue_patterns(''database schema'', 0.3, 10);';
END $$;
