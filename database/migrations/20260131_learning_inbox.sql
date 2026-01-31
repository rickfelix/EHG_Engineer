-- Migration: Learning Inbox (Optional unified view)
-- SD: SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
-- Purpose: Create unified learning inbox table for aggregating learnable items

CREATE TABLE IF NOT EXISTS learning_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN (
    'issue_pattern', 'feedback_cluster', 'retrospective_lesson', 'protocol_improvement'
  )),
  source_id UUID NOT NULL,
  source_table VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  evidence_count INTEGER DEFAULT 1,
  confidence INTEGER DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'sd_created', 'archived'
  )),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_inbox_pending ON learning_inbox(confidence DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_learning_inbox_source ON learning_inbox(source_type, source_id);

COMMENT ON TABLE learning_inbox IS
  'Unified view of all learnable items from various sources (patterns, feedback, retrospectives, improvements)';
COMMENT ON COLUMN learning_inbox.source_type IS
  'Type of source: issue_pattern, feedback_cluster, retrospective_lesson, protocol_improvement';
COMMENT ON COLUMN learning_inbox.evidence_count IS
  'Number of evidence items supporting this learning (higher = more confident)';
COMMENT ON COLUMN learning_inbox.confidence IS
  'Confidence score 0-100 based on evidence count and source reliability';
