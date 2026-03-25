-- Migration: Add addendums JSONB column to EVA governance tables
-- SD: SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001-B (B2: Version Incrementing + Addendum Logging)
-- Purpose: Enable version increment tracking with per-stage addendum entries
-- Structure: [{ stage_number, artifact_count, evidence_count, timestamp }]

-- Add addendums to eva_vision_documents
ALTER TABLE eva_vision_documents
ADD COLUMN IF NOT EXISTS addendums JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN eva_vision_documents.addendums IS 'Version increment log — each writeArtifact upsert appends {stage_number, artifact_count, evidence_count, timestamp}';

-- Add addendums to eva_architecture_plans
ALTER TABLE eva_architecture_plans
ADD COLUMN IF NOT EXISTS addendums JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN eva_architecture_plans.addendums IS 'Version increment log — each writeArtifact upsert appends {stage_number, artifact_count, evidence_count, timestamp}';

-- Verify vision_version_aligned_to exists on architecture plans (added by 20260302_cascade_invalidation_system.sql)
-- If not, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eva_architecture_plans'
    AND column_name = 'vision_version_aligned_to'
  ) THEN
    ALTER TABLE eva_architecture_plans
    ADD COLUMN vision_version_aligned_to INTEGER;
    COMMENT ON COLUMN eva_architecture_plans.vision_version_aligned_to IS 'Vision version this architecture plan was aligned to at creation or last cascade realignment';
  END IF;
END $$;
