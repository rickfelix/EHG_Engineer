-- Integrity Metrics Table
-- Stores GitHub Actions CI/CD results for LEO Protocol visibility
-- Created: 2025-09-22

BEGIN;

-- Create integrity metrics table
CREATE TABLE IF NOT EXISTS integrity_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'backlog-integrity' or 'vh-ideation'
  workflow_run_id BIGINT, -- GitHub Actions run ID
  
  -- Summary counts
  total_gaps INTEGER DEFAULT 0,
  sd_metadata_gaps INTEGER DEFAULT 0,
  prd_contract_gaps INTEGER DEFAULT 0,
  backlog_shape_issues INTEGER DEFAULT 0,
  traceability_gaps INTEGER DEFAULT 0,
  dependency_issues INTEGER DEFAULT 0,
  orphan_items INTEGER DEFAULT 0,
  
  -- Venture-specific (for ideation)
  stage_coverage_gaps INTEGER DEFAULT 0,
  stages_not_ready INTEGER DEFAULT 0,
  ventures_without_governance INTEGER DEFAULT 0,
  recommendation_count INTEGER DEFAULT 0,
  
  -- Top recommendations (JSONB array)
  top_recommendations JSONB DEFAULT '[]'::jsonb,
  
  -- Delta tracking
  previous_total_gaps INTEGER,
  gap_delta INTEGER GENERATED ALWAYS AS (total_gaps - COALESCE(previous_total_gaps, total_gaps)) STORED,
  
  -- Metadata
  status TEXT DEFAULT 'success', -- success, partial, failed
  execution_time_ms INTEGER,
  dry_run BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Prevent duplicate entries for same workflow run
  CONSTRAINT unique_workflow_run UNIQUE(source, workflow_run_id)
);

-- Indexes for performance
CREATE INDEX idx_integrity_metrics_source ON integrity_metrics(source);
CREATE INDEX idx_integrity_metrics_created ON integrity_metrics(created_at DESC);
CREATE INDEX idx_integrity_metrics_total_gaps ON integrity_metrics(total_gaps);

-- Real-time updates for dashboard
ALTER TABLE integrity_metrics REPLICA IDENTITY FULL;

-- Grant permissions for dashboard access
GRANT SELECT ON integrity_metrics TO authenticated;
GRANT INSERT ON integrity_metrics TO authenticated;

COMMIT;

/* Rollback:
BEGIN;
DROP TABLE IF EXISTS integrity_metrics;
COMMIT;
*/