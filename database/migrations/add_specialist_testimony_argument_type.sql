-- Migration: add_specialist_testimony_argument_type
-- Purpose: Add 'specialist_testimony' to debate_arguments.argument_type CHECK constraint
-- Date: 2026-04-06
-- Safe: Additive change, no data loss

ALTER TABLE debate_arguments DROP CONSTRAINT IF EXISTS debate_arguments_argument_type_check;

ALTER TABLE debate_arguments ADD CONSTRAINT debate_arguments_argument_type_check
  CHECK (argument_type IN (
    'initial_position',
    'rebuttal',
    'clarification',
    'constitution_citation',
    'evidence',
    'specialist_testimony'
  ));

-- Rollback:
-- ALTER TABLE debate_arguments DROP CONSTRAINT IF EXISTS debate_arguments_argument_type_check;
-- ALTER TABLE debate_arguments ADD CONSTRAINT debate_arguments_argument_type_check
--   CHECK (argument_type IN ('initial_position', 'rebuttal', 'clarification', 'constitution_citation', 'evidence'));
