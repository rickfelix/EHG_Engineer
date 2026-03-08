-- Migration: Add 3-dimension classification columns to intake tables
-- SD: SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003-A
-- Purpose: Enable interactive classification with Application, Aspects, Intent taxonomy
-- These columns are ADDITIVE - existing columns (venture_tag, business_function) remain untouched

-- ============================================================
-- eva_todoist_intake: Add classification columns
-- ============================================================
ALTER TABLE eva_todoist_intake
  ADD COLUMN IF NOT EXISTS target_application TEXT
    CHECK (target_application IN ('ehg_engineer', 'ehg_app', 'new_venture')),
  ADD COLUMN IF NOT EXISTS target_aspects JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chairman_intent TEXT
    CHECK (chairman_intent IN ('idea', 'insight', 'reference', 'question', 'value')),
  ADD COLUMN IF NOT EXISTS chairman_notes TEXT,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- ============================================================
-- eva_youtube_intake: Add identical classification columns
-- ============================================================
ALTER TABLE eva_youtube_intake
  ADD COLUMN IF NOT EXISTS target_application TEXT
    CHECK (target_application IN ('ehg_engineer', 'ehg_app', 'new_venture')),
  ADD COLUMN IF NOT EXISTS target_aspects JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chairman_intent TEXT
    CHECK (chairman_intent IN ('idea', 'insight', 'reference', 'question', 'value')),
  ADD COLUMN IF NOT EXISTS chairman_notes TEXT,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- ============================================================
-- Indexes for classification queries
-- ============================================================

-- Fast lookup of unclassified items (pending classification)
CREATE INDEX IF NOT EXISTS idx_todoist_intake_unclassified
  ON eva_todoist_intake (created_at ASC)
  WHERE target_application IS NULL AND status != 'error';

CREATE INDEX IF NOT EXISTS idx_youtube_intake_unclassified
  ON eva_youtube_intake (created_at ASC)
  WHERE target_application IS NULL;

-- Fast lookup of classified items (for Unified Inbox, roadmap clustering)
CREATE INDEX IF NOT EXISTS idx_todoist_intake_classified
  ON eva_todoist_intake (target_application, classified_at DESC)
  WHERE target_application IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_youtube_intake_classified
  ON eva_youtube_intake (target_application, classified_at DESC)
  WHERE target_application IS NOT NULL;

-- ============================================================
-- Comments for documentation
-- ============================================================
COMMENT ON COLUMN eva_todoist_intake.target_application IS 'Classification dimension 1: Which application this item targets (ehg_engineer, ehg_app, new_venture)';
COMMENT ON COLUMN eva_todoist_intake.target_aspects IS 'Classification dimension 2: JSON array of aspect tags, context-sensitive per application';
COMMENT ON COLUMN eva_todoist_intake.chairman_intent IS 'Classification dimension 3: Why the Chairman captured this item (idea, insight, reference, question, value)';
COMMENT ON COLUMN eva_todoist_intake.chairman_notes IS 'Free-text notes the Chairman adds during classification for context preservation';
COMMENT ON COLUMN eva_todoist_intake.classification_confidence IS 'AI confidence score (0.00-1.00) for the recommended classification';
COMMENT ON COLUMN eva_todoist_intake.classified_at IS 'Timestamp when classification was completed (serves as checkpoint for session resume)';

COMMENT ON COLUMN eva_youtube_intake.target_application IS 'Classification dimension 1: Which application this item targets (ehg_engineer, ehg_app, new_venture)';
COMMENT ON COLUMN eva_youtube_intake.target_aspects IS 'Classification dimension 2: JSON array of aspect tags, context-sensitive per application';
COMMENT ON COLUMN eva_youtube_intake.chairman_intent IS 'Classification dimension 3: Why the Chairman captured this item (idea, insight, reference, question, value)';
COMMENT ON COLUMN eva_youtube_intake.chairman_notes IS 'Free-text notes the Chairman adds during classification for context preservation';
COMMENT ON COLUMN eva_youtube_intake.classification_confidence IS 'AI confidence score (0.00-1.00) for the recommended classification';
COMMENT ON COLUMN eva_youtube_intake.classified_at IS 'Timestamp when classification was completed (serves as checkpoint for session resume)';
