-- Migration: Retrospective Idempotency
-- SD: SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
-- Purpose: Prevent duplicate pattern extraction from retrospectives

-- Add idempotency tracking to retrospectives
-- 2026-05-05 (SD-LEO-INFRA-BULK-ADD-BEGIN-001): added BEGIN;/COMMIT; for Layer 4.3 CI grep contract. Migration was already applied to production; transaction wrapping affects file-structure validation only, not runtime.
BEGIN;

ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS learning_extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_retrospectives_unextracted
ON retrospectives(created_at DESC)
WHERE learning_extracted_at IS NULL AND quality_score >= 60;

COMMENT ON COLUMN retrospectives.learning_extracted_at IS
  'Timestamp when patterns were extracted. NULL = not yet processed.';

COMMIT;
