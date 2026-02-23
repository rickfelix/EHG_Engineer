-- Migration: Add metadata JSONB column to feedback table
-- Date: 2026-02-23
-- Purpose: Support Telegram bot edge function metadata field (tool-executors.ts line 361)
--          containing domain, telegram_raw_text, enrichment_confidence, enrichment_model,
--          captured_at, and optional youtube_url / youtube_processed fields.
--
-- Risk: LOW - Additive column, nullable, with empty object default. No data loss.
-- Idempotent: Uses IF NOT EXISTS guard via DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feedback' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE feedback ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN feedback.metadata IS 'Flexible JSONB metadata from external sources (e.g., Telegram bot enrichment: domain, confidence, model, raw_text, youtube info)';
    RAISE NOTICE 'feedback.metadata column added successfully';
  ELSE
    RAISE NOTICE 'feedback.metadata column already exists - skipping';
  END IF;
END
$$;

-- Rollback (if needed):
-- ALTER TABLE feedback DROP COLUMN IF EXISTS metadata;
