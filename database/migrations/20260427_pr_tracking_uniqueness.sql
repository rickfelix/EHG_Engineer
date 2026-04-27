-- Migration: pr_tracking uniqueness guard
-- SD: SD-LEO-INFRA-PR-TRACKING-BACKFILL-001 (FR-5)
-- Adds a partial unique index on ship_review_findings(sd_key, pr_number)
-- where sd_key is non-null. Prevents duplicate canonical PR-to-SD join rows
-- from concurrent backfill + populator-hook + manual review writes.
--
-- The WHERE clause preserves coexistence with the existing unattributed
-- review rows (sd_key IS NULL).
--
-- Forward-only; CREATE UNIQUE INDEX IF NOT EXISTS makes re-runs safe.

CREATE UNIQUE INDEX IF NOT EXISTS ux_ship_review_findings_sd_pr
  ON ship_review_findings (sd_key, pr_number)
  WHERE sd_key IS NOT NULL;

COMMENT ON INDEX ux_ship_review_findings_sd_pr IS
  'Idempotency guard for the canonical PR-to-SD join. Prevents duplicates from concurrent backfill (scripts/backfill-pr-tracking.js) and populator hook (scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js).';
