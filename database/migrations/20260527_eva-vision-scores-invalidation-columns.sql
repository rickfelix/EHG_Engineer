-- SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-4)
-- Add invalidation columns to eva_vision_scores + backfill the known-false CronGenius score (pilot F1).
--
-- Context: CronGenius pilot 2026-05-27 surfaced that /heal vision rubrics resolved EHG_Engineer
-- paths regardless of CWD, producing a false 100/100 score for VISION-CRONGENIUS-API-L2-001
-- (id 63155810-2114-4eb8-a124-c971e199a011). eva_vision_scores schema had no invalidation
-- mechanism, so the false score could not be flagged in-place. This migration adds the
-- metadata + invalidated_at + invalidation_reason columns and backfills the CronGenius row.
--
-- Additive-only — no breaking changes for existing readers. Migration is revert-safe (new
-- columns are nullable / have defaults; backfill UPDATE is targeted to a single row).

BEGIN;

ALTER TABLE eva_vision_scores
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS invalidation_reason text NULL;

COMMENT ON COLUMN eva_vision_scores.metadata IS
  'Free-form scoring metadata (e.g., invalidation provenance, scorer version notes). SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001.';
COMMENT ON COLUMN eva_vision_scores.invalidated_at IS
  'Non-null when the score is known-invalid (e.g., scored against wrong codebase, scorer bug). SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001.';
COMMENT ON COLUMN eva_vision_scores.invalidation_reason IS
  'Free-form reason citing the pilot finding / SD that invalidated this score. SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001.';

-- Backfill: mark the CronGenius false-positive score as invalidated (pilot finding F1).
-- Idempotent guard: only updates when invalidated_at IS NULL.
UPDATE eva_vision_scores
SET
  invalidated_at = NOW(),
  invalidation_reason = 'FALSE POSITIVE — /heal vision deterministic mode scored against EHG_Engineer rubric paths (root cause: check-types.js:14 hard-coded ROOT via __dirname, ignoring CWD). Pilot finding F1, journal project_crongenius_first_venture_pilot_2026_05_27. Fixed by SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (target-path factory refactor).',
  metadata = jsonb_build_object(
    'invalidated_by_sd', 'SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001',
    'pilot_journal', 'project_crongenius_first_venture_pilot_2026_05_27',
    'finding_id', 'F1',
    'original_score', 100,
    'original_vision_key', 'VISION-CRONGENIUS-API-L2-001'
  )
WHERE id = '63155810-2114-4eb8-a124-c971e199a011'
  AND invalidated_at IS NULL;

COMMIT;
