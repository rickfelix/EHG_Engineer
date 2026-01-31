-- Migration: Feedback-to-Pattern Bridge
-- SD: SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
-- Purpose: Add source tracking to issue_patterns and clustering tracking to feedback

-- Add source tracking to issue_patterns
ALTER TABLE issue_patterns
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'retrospective'
  CHECK (source IN ('retrospective', 'feedback_cluster', 'manual'));

ALTER TABLE issue_patterns
ADD COLUMN IF NOT EXISTS source_feedback_ids JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_issue_patterns_source
ON issue_patterns(source) WHERE source = 'feedback_cluster';

-- Add clustering tracking to feedback
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS cluster_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feedback_clustering
ON feedback(error_hash, created_at DESC)
WHERE status IN ('new', 'triaged') AND cluster_processed_at IS NULL;

COMMENT ON COLUMN issue_patterns.source IS
  'Origin of pattern: retrospective (default), feedback_cluster, or manual';
COMMENT ON COLUMN issue_patterns.source_feedback_ids IS
  'Array of feedback UUIDs that contributed to this pattern (for feedback_cluster source)';
COMMENT ON COLUMN feedback.cluster_processed_at IS
  'Timestamp when feedback was processed by clustering job. NULL = not yet processed.';
