-- Migration: Add target_platform to ventures + platform to venture_artifacts
-- SD: SD-DUALPLAT-MOBILE-WEB-ORCH-001-A
-- Purpose: Enable per-venture platform targeting for dual-platform design generation
--
-- target_platform: Controls which Stitch generation passes run
--   'web'    → DESKTOP only
--   'mobile' → MOBILE only
--   'both'   → MOBILE first, then DESKTOP (default)
--
-- platform: Tags each generated screen with its target platform
--   'mobile'  → Generated with deviceType=MOBILE
--   'desktop' → Generated with deviceType=DESKTOP

-- 1. Add target_platform to ventures (default: 'both')
ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS target_platform TEXT NOT NULL DEFAULT 'both'
  CHECK (target_platform IN ('web', 'mobile', 'both'));

COMMENT ON COLUMN ventures.target_platform IS 'Platform targeting: web (desktop only), mobile (mobile only), both (mobile-first + desktop)';

-- 2. Add platform to venture_artifacts (nullable — existing rows have no platform tag)
ALTER TABLE venture_artifacts
  ADD COLUMN IF NOT EXISTS platform TEXT
  CHECK (platform IS NULL OR platform IN ('mobile', 'desktop'));

COMMENT ON COLUMN venture_artifacts.platform IS 'Platform tag for generated design screens: mobile or desktop';

-- 3. Index for filtering artifacts by platform
CREATE INDEX IF NOT EXISTS idx_venture_artifacts_platform
  ON venture_artifacts (venture_id, platform)
  WHERE platform IS NOT NULL;
