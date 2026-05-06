-- ============================================================================
-- Migration: 20260506160000_backfill_target_repos_cross_repo_sds.sql
-- SD: SD-LEO-INFRA-CROSS-REPO-MERGE-001
-- Date: 2026-05-06
--
-- Purpose:
--   Backfill `metadata.target_repos = ['EHG', 'EHG_Engineer']` on three known
--   cross-repo SDs so the new PR_MERGE_VERIFICATION repo-scope helper
--   (computeReposForSD in lead-final-approval/gates.js) preserves their
--   intended both-repo scan behavior post-deploy.
--
--   Without this backfill, those SDs would fall through to the Tier-2 branch
--   of computeReposForSD (which derives a SINGLE repo from target_application)
--   and stop scanning the OTHER repo — losing coverage on cross-repo work
--   that has already shipped.
--
-- Rows targeted (3, all completed):
--   - SD-LEO-FEAT-STAGE-REJECT-KILL-001     (target_application=EHG; cross-repo)
--   - SD-LEO-FEAT-STAGE-POST-LAUNCH-001     (target_application=EHG; cross-repo)
--   - SD-LEO-FIX-REVERT-CROSS-VENTURE-001   (target_application=EHG_Engineer; cross-repo cleanup)
--
-- Idempotency:
--   * jsonb_set with create_missing=true preserves all other metadata keys.
--   * WHERE clause guards against double-application (NOT (metadata ? 'target_repos')).
--   * Re-running matches 0 rows after first apply.
--
-- ROLLBACK:
--   UPDATE strategic_directives_v2
--   SET metadata = metadata - 'target_repos'
--   WHERE sd_key IN (
--     'SD-LEO-FEAT-STAGE-REJECT-KILL-001',
--     'SD-LEO-FEAT-STAGE-POST-LAUNCH-001',
--     'SD-LEO-FIX-REVERT-CROSS-VENTURE-001'
--   );
-- ============================================================================

BEGIN;

DO $backfill$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  WITH backfilled AS (
    UPDATE strategic_directives_v2
    SET metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{target_repos}',
      '["EHG", "EHG_Engineer"]'::jsonb,
      true
    )
    WHERE sd_key IN (
      'SD-LEO-FEAT-STAGE-REJECT-KILL-001',
      'SD-LEO-FEAT-STAGE-POST-LAUNCH-001',
      'SD-LEO-FIX-REVERT-CROSS-VENTURE-001'
    )
      AND (NOT (metadata ? 'target_repos') OR metadata->'target_repos' = 'null')
    RETURNING sd_key
  )
  SELECT COUNT(*) INTO v_rows_affected FROM backfilled;

  RAISE NOTICE '[SD-LEO-INFRA-CROSS-REPO-MERGE-001] Backfilled metadata.target_repos on % cross-repo SDs.', v_rows_affected;
END;
$backfill$;

COMMIT;
