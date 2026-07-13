-- @approved-by: codestreetlabs@gmail.com
-- Add 'unverified' as a valid eva_vision_scores.threshold_action value.
-- SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001 (campaign-mode inline fix)
--
-- scripts/eva/heal-command.mjs's persist path (SD-WRITERCONSUMER-ASYMMETRY-DETECTION-
-- SCOPECOMPLETION-ORCH-001-0 / FR-C0-5, TESTING AC-C0-006) computes
-- threshold_action='unverified' whenever an SD's lineage_verdict is
-- BACKFILLED_LOW_CONFIDENCE (a per-SD verdict-tier override that trumps the
-- score-based threshold) -- but the original CHECK constraint was never widened
-- to allow that value, so every heal-score persist attempt for a low-confidence-
-- lineage SD has been failing with a CHECK-constraint violation since that
-- feature was written. Confirmed live: this SD's own heal-score persist hit
-- exactly this error, because it was itself swept into the vision_key backfill
-- batch (fixed earlier in this same SD) and stamped lineage_verdict=
-- BACKFILLED_LOW_CONFIDENCE. The bug was previously unreachable/latent, since
-- the backfill tool that stamps lineage_verdict was ALSO broken (silently wrote
-- nothing) until this SD's own FR-3 fixed it.

ALTER TABLE eva_vision_scores
  DROP CONSTRAINT eva_vision_scores_threshold_action_check;

ALTER TABLE eva_vision_scores
  ADD CONSTRAINT eva_vision_scores_threshold_action_check
  CHECK (threshold_action IN ('accept', 'minor_sd', 'gap_closure_sd', 'escalate', 'unverified'));

COMMENT ON COLUMN eva_vision_scores.threshold_action IS
  'Action taken based on score: accept (>=93), minor_sd (83-92), gap_closure_sd (70-82), escalate (<70), unverified (lineage_verdict=BACKFILLED_LOW_CONFIDENCE override, independent of score).';
