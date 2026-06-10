-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-FIX-REMEDIATE-ARRESTED-VENTURE-001
--
-- ⚠ DO NOT run with apply-migration.js --split-statements (named $storm_restore$ DO block).
--
-- Restores the purged stale storm rows from the quarantine table. COLUMN-EXPLICIT (all 28
-- columns in ordinal order) so schema drift during the verification window fails LOUDLY
-- instead of silently misaligning. ON CONFLICT (id) DO NOTHING is idempotent; the
-- post-restore assert RAISES if any quarantined id failed to land. No constraint changes
-- to undo (the UP adds none). Quarantine table retained until the verification window
-- passes, then may be dropped manually.

INSERT INTO venture_artifacts (
  id, venture_id, lifecycle_stage, artifact_type, title, content, file_url, version,
  is_current, metadata, created_at, created_by, updated_at, quality_score,
  validation_status, validated_at, validated_by, epistemic_classification,
  epistemic_evidence, artifact_embedding, embedding_model, embedding_updated_at,
  indexing_status, source, artifact_data, supports_vision_key, supports_plan_key, platform
)
SELECT
  id, venture_id, lifecycle_stage, artifact_type, title, content, file_url, version,
  is_current, metadata, created_at, created_by, updated_at, quality_score,
  validation_status, validated_at, validated_by, epistemic_classification,
  epistemic_evidence, artifact_embedding, embedding_model, embedding_updated_at,
  indexing_status, source, artifact_data, supports_vision_key, supports_plan_key, platform
FROM venture_artifacts_storm_quarantine_20260610
ON CONFLICT (id) DO NOTHING;

DO $storm_restore$
DECLARE
  v_missing bigint;
BEGIN
  SELECT count(*) INTO v_missing
  FROM venture_artifacts_storm_quarantine_20260610 q
  WHERE NOT EXISTS (SELECT 1 FROM venture_artifacts va WHERE va.id = q.id);
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'rollback incomplete: % quarantined row(s) not present after restore — investigate', v_missing;
  END IF;
  RAISE NOTICE 'storm purge rollback: complete — all quarantined rows restored';
END
$storm_restore$;
