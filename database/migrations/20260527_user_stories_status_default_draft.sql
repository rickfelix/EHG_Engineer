-- SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 (Option B): change user_stories.status
-- default from 'ready' to 'draft' so future auto-generated stories with
-- all-boilerplate acceptance_criteria default to invisible-to-quality-gate state.
--
-- Defense-in-depth: scripts/modules/auto-trigger-stories.mjs also sets status
-- explicitly based on allAcsBoilerplate(). This migration is a safety net for
-- any future code path that omits status.
--
-- REVERSIBLE: see down-migration at the bottom.

ALTER TABLE user_stories ALTER COLUMN status SET DEFAULT 'draft';

COMMENT ON COLUMN user_stories.status IS
  'Story lifecycle status. Default changed to draft 2026-05-27 per SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 Option B. Auto-generated boilerplate stories default to draft (invisible to USER_STORY_QUALITY gate); human/sub-agent enrichment + scripts/promote-user-stories.js moves them to ready (scoreable). Existing rows unaffected by this migration.';

-- ──────────────────────────────────────────────────────────────────────────
-- Down-migration (run only if reverting):
--   ALTER TABLE user_stories ALTER COLUMN status SET DEFAULT 'ready';
-- ──────────────────────────────────────────────────────────────────────────
