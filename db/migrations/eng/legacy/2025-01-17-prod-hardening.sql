-- Production Hardening for User Stories
-- Additional index to prevent SD duplicates
-- Run AFTER the compatibility migration

-- Prevent duplicate strategic directives by legacy_id
-- This is critical for production to avoid SD duplication issues
CREATE UNIQUE INDEX IF NOT EXISTS uk_sd_legacy_id_unique
    ON strategic_directives_v2 (legacy_id)
    WHERE legacy_id IS NOT NULL;

-- Additional performance indexes for production scale
CREATE INDEX IF NOT EXISTS idx_sd_backlog_map_sd_status
    ON sd_backlog_map(sd_id, verification_status, item_type)
    WHERE story_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sd_backlog_map_last_verified
    ON sd_backlog_map(last_verified_at DESC)
    WHERE verification_status IS NOT NULL;

-- Index for webhook updates (by story_key)
CREATE INDEX IF NOT EXISTS idx_sd_backlog_map_story_lookup
    ON sd_backlog_map(story_key)
    WHERE story_key IS NOT NULL;

-- Composite index for release gate queries
CREATE INDEX IF NOT EXISTS idx_sd_backlog_release_gate
    ON sd_backlog_map(sd_id, verification_status)
    INCLUDE (story_key, passing_count, coverage_pct)
    WHERE item_type = 'story';

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Production hardening indexes created successfully';
    RAISE NOTICE 'SD duplicate prevention index: uk_sd_legacy_id_unique';
    RAISE NOTICE 'Performance indexes added for scale';
END $$;