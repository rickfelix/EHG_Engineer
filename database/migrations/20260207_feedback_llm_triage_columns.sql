-- Migration: Add LLM triage columns to feedback table
-- SD: SD-LEO-ENH-EVOLVE-LEO-ASSIST-001
-- US-003: Cloud LLM triage with confidence scoring
-- Date: 2026-02-07
--
-- Adds columns to store structured LLM classification results:
-- - ai_triage_confidence: Integer 0-100 confidence score
-- - ai_triage_classification: LLM's classification (bug/enhancement/question/etc)
-- - ai_triage_source: Whether result came from 'llm' or 'rules' fallback

-- =============================================================================
-- PHASE 1: ADD COLUMNS
-- =============================================================================

ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS ai_triage_confidence INTEGER NULL;

COMMENT ON COLUMN feedback.ai_triage_confidence IS
'Confidence score (0-100) from AI triage classification. Higher values indicate more certain classification.';

ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS ai_triage_classification VARCHAR(50) NULL;

COMMENT ON COLUMN feedback.ai_triage_classification IS
'AI-determined classification: bug, enhancement, question, duplicate, invalid. May differ from user-submitted type.';

ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS ai_triage_source VARCHAR(20) NULL;

COMMENT ON COLUMN feedback.ai_triage_source IS
'Source of triage classification: llm (cloud/local LLM) or rules (rule-based fallback).';

-- =============================================================================
-- PHASE 2: CONSTRAINTS
-- =============================================================================

ALTER TABLE feedback
ADD CONSTRAINT chk_ai_triage_confidence_range
CHECK (ai_triage_confidence IS NULL OR (ai_triage_confidence >= 0 AND ai_triage_confidence <= 100));

ALTER TABLE feedback
ADD CONSTRAINT chk_ai_triage_source_valid
CHECK (ai_triage_source IS NULL OR ai_triage_source IN ('llm', 'rules'));

-- =============================================================================
-- PHASE 3: INDEX FOR ANALYTICS
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_ai_triage_confidence
ON feedback(ai_triage_confidence)
WHERE ai_triage_confidence IS NOT NULL;

-- =============================================================================
-- COMPLETION
-- =============================================================================

DO $$ BEGIN
  RAISE NOTICE '[MIGRATION] ✓ Added LLM triage columns: ai_triage_confidence, ai_triage_classification, ai_triage_source';
  RAISE NOTICE '[MIGRATION] ✓ Added CHECK constraints for confidence range (0-100) and source values';
  RAISE NOTICE '[MIGRATION] ✓ Created index on ai_triage_confidence';
END $$;
