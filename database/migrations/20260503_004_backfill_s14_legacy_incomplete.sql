-- ============================================================================
-- SD-LEO-FIX-S14-WORKER-OMITS-001 FR-003 — backfill venture_artifacts to flag
-- ventures that ran through the broken persistArtifact path with metadata.
-- legacy_incomplete=true. This is the default backfill strategy (option b);
-- regeneration (option a) is reserved for PrivacyPatrol AI specifically and
-- is a separate operation post-deploy.
--
-- Origin: 2026-05-03 PrivacyPatrol AI revealed only blueprint_technical_
-- architecture persisted at lifecycle_stage=14 (1 of 5 expected). This
-- migration tags affected ventures' existing row with metadata.
-- legacy_incomplete=true so downstream consumers can filter or alert on the
-- inconsistency without losing the existing data.
--
-- Affected venture detection: any venture with lifecycle_stage=14 rows whose
-- DISTINCT artifact_type list count < 5 — those are the partial-emit ventures.
--
-- Idempotency: jsonb_set with create_if_missing=true is idempotent on
-- repeated runs (overwrites the same key with the same value). The WHERE
-- filter additionally excludes already-tagged rows for clarity.
--
-- Per database-agent finding 04f646d8: 1 venture affected today
-- (08d20036-03c9-4a26-bbc5-f37a18dfdf23 = PrivacyPatrol AI).
-- ============================================================================

BEGIN;

-- Tag affected ventures' existing blueprint_technical_architecture row with
-- metadata.legacy_incomplete=true. Detection: ventures with fewer than 5
-- distinct artifact_types at lifecycle_stage=14.
WITH affected_ventures AS (
  SELECT venture_id
    FROM venture_artifacts
   WHERE lifecycle_stage = 14
   GROUP BY venture_id
  HAVING COUNT(DISTINCT artifact_type) < 5
)
UPDATE venture_artifacts va
   SET metadata = jsonb_set(
         COALESCE(va.metadata, '{}'::jsonb),
         '{legacy_incomplete}',
         'true'::jsonb,
         true -- create_if_missing
       ),
       updated_at = NOW()
  FROM affected_ventures av
 WHERE va.venture_id = av.venture_id
   AND va.lifecycle_stage = 14
   AND va.artifact_type = 'blueprint_technical_architecture'
   AND (va.metadata->>'legacy_incomplete') IS DISTINCT FROM 'true';

-- Down-migration recipe (emergency rollback):
--   BEGIN;
--     UPDATE venture_artifacts
--        SET metadata = metadata - 'legacy_incomplete'
--      WHERE lifecycle_stage = 14
--        AND artifact_type = 'blueprint_technical_architecture'
--        AND (metadata->>'legacy_incomplete') = 'true';
--   COMMIT;

COMMIT;
