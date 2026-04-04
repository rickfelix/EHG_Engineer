-- Migration: Board Deliberation Structural Divergence (Child A)
-- SD: SD-LEO-INFRA-BOARD-DELIBERATION-STRUCTURAL-001A
-- Adds structured_dissent JSONB to debate_arguments
-- Adds standing_question TEXT to specialist_registry

-- Add structured_dissent to debate_arguments
ALTER TABLE debate_arguments
ADD COLUMN IF NOT EXISTS structured_dissent JSONB DEFAULT NULL;

COMMENT ON COLUMN debate_arguments.structured_dissent IS 'Structured dissent output: {assumption_challenged, counter_evidence, confidence_in_dissent}';

-- Add standing_question to specialist_registry
ALTER TABLE specialist_registry
ADD COLUMN IF NOT EXISTS standing_question TEXT DEFAULT NULL;

COMMENT ON COLUMN specialist_registry.standing_question IS 'The unique question this specialist brings to every deliberation';
