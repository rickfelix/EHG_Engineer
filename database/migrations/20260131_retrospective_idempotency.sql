-- Migration: Retrospective Idempotency
-- SD: SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
-- Purpose: Prevent duplicate pattern extraction from retrospectives

-- Add idempotency tracking to retrospectives
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS learning_extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_retrospectives_unextracted
ON retrospectives(created_at DESC)
WHERE learning_extracted_at IS NULL AND quality_score >= 60;

COMMENT ON COLUMN retrospectives.learning_extracted_at IS
  'Timestamp when patterns were extracted. NULL = not yet processed.';
