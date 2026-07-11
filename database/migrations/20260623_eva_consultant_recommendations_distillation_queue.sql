-- SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-A (FR-1)
-- Child idx 0 (dependency root) of the Brainstorm Distillation Pipeline orchestrator
-- (SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001).
-- ADDITIVE, nullable, REVERSIBLE, idempotent. No drops/renames.
-- @approved-by: codestreetlabs@gmail.com
-- (additive-DDL class chairman-ratified 2026-06-16 b917c3e1; applied by Adam as scribe under the 2026-07-11 verbal-approval policy)
--
-- Adds the chairman review-queue substrate to eva_consultant_recommendations so a distilled
-- brainstorm candidate can be recorded as a chairman-reviewable recommendation row that LINKS
-- back to its source wave item and carries the distilled SD payload:
--   * source_wave_item_id  -> FK to roadmap_wave_items(id) (uuid). ON DELETE SET NULL so deleting
--                             a wave item preserves the chairman-review evidence row.
--   * distilled_sd_payload -> the distilled SD JSON the distiller child (idx 2) writes and the
--                             chairman reviews / the disposition-gate child (idx 1) FK-checks.
--   * confidence_tier      -> ALREADY EXISTS (text). The ADD COLUMN IF NOT EXISTS is an explicit,
--                             idempotent no-op kept here only to make the queue contract complete.
--
-- APPLIED 2026-07-11 (QF-20260705-893) via the chairman 3-factor --prod-deploy path (not the
-- automated additive-DDL delegation — isDelegatableAdditive() classifies this file NOT delegatable
-- because source_wave_item_id carries a REFERENCES clause; Rule C in
-- scripts/lib/migration-tier-classifier.mjs deliberately excludes FK-bearing ADD COLUMN from the
-- automated path by design). source_wave_item_id + distilled_sd_payload columns are now live —
-- the distiller child (idx 2) writer can run.
--
-- Idempotent (IF NOT EXISTS) so a re-run is a no-op.

ALTER TABLE eva_consultant_recommendations
  ADD COLUMN IF NOT EXISTS source_wave_item_id uuid REFERENCES roadmap_wave_items(id) ON DELETE SET NULL;

ALTER TABLE eva_consultant_recommendations
  ADD COLUMN IF NOT EXISTS distilled_sd_payload jsonb;

-- No-op when already present (confidence_tier exists as text); kept for an explicit queue contract.
ALTER TABLE eva_consultant_recommendations
  ADD COLUMN IF NOT EXISTS confidence_tier text;

CREATE INDEX IF NOT EXISTS idx_eva_consultant_recommendations_source_wave_item_id
  ON eva_consultant_recommendations(source_wave_item_id);

COMMENT ON COLUMN eva_consultant_recommendations.source_wave_item_id IS
  'SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-A: FK to the roadmap_wave_items row this distilled recommendation was minted from (chairman review queue link).';
COMMENT ON COLUMN eva_consultant_recommendations.distilled_sd_payload IS
  'SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-A: the distilled SD JSON payload (distiller child idx 2 writes; chairman reviews; disposition-gate child idx 1 FK-checks acceptance).';

-- ROLLBACK (reversible):
--   DROP INDEX IF EXISTS idx_eva_consultant_recommendations_source_wave_item_id;
--   ALTER TABLE eva_consultant_recommendations DROP COLUMN IF EXISTS distilled_sd_payload;
--   ALTER TABLE eva_consultant_recommendations DROP COLUMN IF EXISTS source_wave_item_id;
--   (confidence_tier predates this migration — do NOT drop it on rollback.)
