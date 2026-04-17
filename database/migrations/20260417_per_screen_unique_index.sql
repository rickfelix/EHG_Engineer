-- Migration: Per-screen S17 artifact storage
-- SD: SD-S17-DESIGN-INTELLIGENCE-ORCH-001-A
--
-- Adds screenId discriminator to the unique current artifact index.
-- This allows S17 to store one artifact per screen (14 rows) instead of
-- one blob containing all screens.
--
-- Backward compatible: non-S17 artifacts have metadata->>'screenId' IS NULL,
-- so COALESCE returns '__no_screen__' — existing uniqueness is preserved.

-- Step 1: Drop the existing index
DROP INDEX IF EXISTS idx_unique_current_artifact;

-- Step 2: Recreate with screenId discriminator
CREATE UNIQUE INDEX idx_unique_current_artifact
  ON venture_artifacts (
    venture_id,
    lifecycle_stage,
    artifact_type,
    COALESCE(metadata->>'screenId', '__no_screen__')
  )
  WHERE is_current = true;

-- Step 3: Register s17_variant_scores artifact type
-- Get the current CHECK constraint definition, drop it, and recreate with the new type.
-- Note: This is additive — all existing types remain valid.
DO $$
DECLARE
  current_types text[];
BEGIN
  -- Check if s17_variant_scores already exists in the constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'artifact_type_check'
    AND check_clause LIKE '%s17_variant_scores%'
  ) THEN
    -- Drop and recreate with new type added
    ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS artifact_type_check;

    ALTER TABLE venture_artifacts ADD CONSTRAINT artifact_type_check CHECK (
      artifact_type IN (
        'stage_analysis', 'devils_advocate_review', 'competitive_review',
        'market_validation', 'market_analysis', 'financial_projection',
        'financial_analysis', 'risk_assessment', 'strategy_recommendation',
        'executive_summary', 'stitch_curation', 'stitch_design_export',
        'soul_extraction', 'soul_document', 'brand_tokens',
        's17_archetypes', 's17_approved', 's17_qa_report',
        's17_fill_screen', 's17_variant_scores',
        'venture_report', 'stage_gate_result', 'sprint_plan',
        'sprint_execution', 'launch_checklist', 'post_launch_review',
        'growth_metrics', 'pivot_analysis', 'exit_readiness',
        'final_report'
      )
    );

    RAISE NOTICE 'Added s17_variant_scores to artifact_type_check constraint';
  ELSE
    RAISE NOTICE 's17_variant_scores already in artifact_type_check — no change';
  END IF;
END $$;
