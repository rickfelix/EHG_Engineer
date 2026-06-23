-- SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-A (FR-1)
-- Child idx 0 (dependency root) of the Brainstorm Distillation Pipeline orchestrator
-- (SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001).
-- ADDITIVE, nullable, REVERSIBLE, idempotent. No drops/renames.
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
-- DORMANT: the fleet AUTHORS and TESTS this migration; workers CANNOT self-apply prod. This is an
-- ADDITIVE, nullable change — Adam applies it via the database-agent under the chairman's additive-DDL
-- delegation. It is NOT chairman-gated (an additive nullable column needs no RLS policy). Until applied,
-- the queue writer cannot run (its insert surfaces the missing-column error rather than swallowing it) —
-- so the distiller child (idx 2) that calls the writer is sequenced AFTER this migration is applied.
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
