-- Migration: ship_review_findings FK + merge metadata columns
-- SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001 (FR-6 / US-006)
-- Date: 2026-04-28
--
-- Hardens ship_review_findings:
--   1. Adds merged_at + merge_commit_sha columns for authoritative backfill metadata
--      (sibling of synthesized_at from SD-MAN-INFRA-RECONCILE-S18-S26-001).
--   2. Adds NOT VALID FK from sd_key → strategic_directives_v2(sd_key).
--      NOT VALID preserves existing rows; future inserts/updates are validated.
--      sd_key remains nullable since legacy rows may not have it set.
--
-- Idempotent: uses IF NOT EXISTS + checks for existing constraint name.

ALTER TABLE ship_review_findings
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ NULL;

ALTER TABLE ship_review_findings
  ADD COLUMN IF NOT EXISTS merge_commit_sha TEXT NULL;

COMMENT ON COLUMN ship_review_findings.merged_at IS
  'Timestamp of PR merge (from gh pr view --json mergedAt). Authoritative for backfill rows; may be NULL on real-time-logged rows from /ship Step 5.5.';

COMMENT ON COLUMN ship_review_findings.merge_commit_sha IS
  'SHA of the merge commit (from gh pr view --json mergeCommit.oid). Used by SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001 nightly cron to verify PRs are still merged on main.';

-- Add FK as NOT VALID so existing rows are not retroactively checked.
-- The constraint applies to new inserts and updates from this point forward.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ship_review_findings_sd_key_fkey'
  ) THEN
    ALTER TABLE ship_review_findings
      ADD CONSTRAINT ship_review_findings_sd_key_fkey
      FOREIGN KEY (sd_key) REFERENCES strategic_directives_v2(sd_key)
      DEFERRABLE INITIALLY DEFERRED
      NOT VALID;
  END IF;
END $$;
