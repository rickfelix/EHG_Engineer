-- Migration: Add YouTube cross-link columns to eva_todoist_intake
-- Purpose: Enable extraction of YouTube URLs from Todoist descriptions
--          and cross-linking with eva_youtube_intake when same video exists
-- ============================================================================

-- Add columns for extracted YouTube data
ALTER TABLE eva_todoist_intake
  ADD COLUMN IF NOT EXISTS extracted_youtube_id TEXT,
  ADD COLUMN IF NOT EXISTS extracted_youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_intake_id UUID REFERENCES eva_youtube_intake(id);

-- Index for dedup lookups by video ID
CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_youtube_id
  ON eva_todoist_intake(extracted_youtube_id)
  WHERE extracted_youtube_id IS NOT NULL;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- 1. Added extracted_youtube_id (TEXT) - 11-char video ID parsed from description
-- 2. Added extracted_youtube_url (TEXT) - Normalized YouTube URL
-- 3. Added youtube_intake_id (UUID FK) - Cross-link to eva_youtube_intake
-- 4. Added partial index on extracted_youtube_id for fast dedup lookups
