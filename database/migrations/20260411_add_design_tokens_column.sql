-- Migration: Add design_tokens JSONB column to design_reference_library
-- SD: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-A
-- Purpose: Store structured design tokens extracted via LLM from reference sites

ALTER TABLE design_reference_library
  ADD COLUMN IF NOT EXISTS design_tokens JSONB;

COMMENT ON COLUMN design_reference_library.design_tokens IS 'Structured design tokens (colors, typography, spacing, etc.) extracted from reference site via LLM analysis';

-- Rollback:
-- ALTER TABLE design_reference_library DROP COLUMN IF EXISTS design_tokens;
