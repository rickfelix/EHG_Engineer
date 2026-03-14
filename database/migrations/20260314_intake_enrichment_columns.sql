-- Migration: Add enrichment columns to eva_todoist_intake and eva_youtube_intake
-- SD: SD-DISTILL-PIPELINE-CHAIRMAN-REVIEW-ORCH-001-A
-- Purpose: Enable content enrichment before classification in the /distill pipeline
-- Type: Additive-only (ALTER TABLE ADD COLUMN IF NOT EXISTS), backward compatible

-- New columns on eva_todoist_intake
ALTER TABLE eva_todoist_intake
  ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_summary TEXT,
  ADD COLUMN IF NOT EXISTS chairman_reviewed_at TIMESTAMPTZ;

-- Add CHECK constraint for enrichment_status (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_todoist_enrichment_status'
  ) THEN
    ALTER TABLE eva_todoist_intake
      ADD CONSTRAINT chk_todoist_enrichment_status
      CHECK (enrichment_status IN ('pending', 'enriched', 'failed'));
  END IF;
END $$;

-- Same columns on eva_youtube_intake
ALTER TABLE eva_youtube_intake
  ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_summary TEXT,
  ADD COLUMN IF NOT EXISTS chairman_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_youtube_enrichment_status'
  ) THEN
    ALTER TABLE eva_youtube_intake
      ADD CONSTRAINT chk_youtube_enrichment_status
      CHECK (enrichment_status IN ('pending', 'enriched', 'failed'));
  END IF;
END $$;

-- Partial indexes for finding unreviewed items efficiently
CREATE INDEX IF NOT EXISTS idx_todoist_unreviewed
  ON eva_todoist_intake (chairman_reviewed_at) WHERE chairman_reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_youtube_unreviewed
  ON eva_youtube_intake (chairman_reviewed_at) WHERE chairman_reviewed_at IS NULL;

-- Partial indexes for finding pending enrichment items
CREATE INDEX IF NOT EXISTS idx_todoist_enrichment_pending
  ON eva_todoist_intake (enrichment_status) WHERE enrichment_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_youtube_enrichment_pending
  ON eva_youtube_intake (enrichment_status) WHERE enrichment_status = 'pending';
