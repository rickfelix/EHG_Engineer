-- Migration: Add 'enhancement' and 'uat' to ai_quality_assessments.sd_type CHECK constraint
-- Date: 2026-02-06
-- Issue: Check constraint missing enhancement and uat sd_types
-- Impact: Allows storing quality assessments for enhancement and uat SD types

BEGIN;

-- Drop existing constraint
ALTER TABLE ai_quality_assessments
DROP CONSTRAINT IF EXISTS ai_quality_assessments_sd_type_check;

-- Add new constraint with enhancement and uat included
ALTER TABLE ai_quality_assessments
ADD CONSTRAINT ai_quality_assessments_sd_type_check
CHECK (sd_type = ANY (ARRAY[
  'feature'::text,
  'bugfix'::text,
  'performance'::text,
  'database'::text,
  'docs'::text,
  'documentation'::text,
  'infrastructure'::text,
  'refactor'::text,
  'security'::text,
  'orchestrator'::text,
  'qa'::text,
  'enhancement'::text,
  'uat'::text
]));

COMMIT;
