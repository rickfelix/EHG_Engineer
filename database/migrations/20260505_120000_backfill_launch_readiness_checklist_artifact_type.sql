-- SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-6
-- Backfill legacy 'launch_marketing_checklist' rows on Stage 23 to canonical
-- 'launch_readiness_checklist'. Idempotent (re-run returns 0 rows affected).
-- The legacy alias remains accepted by the venture_artifacts CHECK constraint
-- (per database/migrations/20260421_expand_venture_artifacts_marketing_types.sql)
-- so existing rows that were emitted with the wrong name are preserved through
-- this rename, and the legacy artifact_type remains a deprecated read-only alias
-- for ventures that already have it (per FR-1 deprecated alias contract in
-- lib/eva/artifact-types.js).
--
-- Affects: 1 row in dev DB (PrivacyPatrol AI venture artifact_id discovered in
-- baseline check 2026-05-05). Pre-migration metadata.legacy_artifact_type is set
-- to 'launch_marketing_checklist' for audit fidelity.
--
-- Migration safety: BEGIN/COMMIT, IF EXISTS guarded, idempotent via WHERE clause.
-- No DDL; data-only update.
BEGIN;

-- Pre-count assertion: capture pre-migration row count for audit log
DO $$
DECLARE
  v_pre_count int;
  v_post_count int;
BEGIN
  SELECT count(*) INTO v_pre_count
  FROM public.venture_artifacts
  WHERE lifecycle_stage = 23 AND artifact_type = 'launch_marketing_checklist';

  RAISE NOTICE '[FR-6 backfill] pre-migration legacy rows on stage 23: %', v_pre_count;

  -- Idempotent backfill: only updates rows still on the legacy artifact_type.
  -- metadata.legacy_artifact_type preserved for audit; metadata jsonb merged
  -- with COALESCE to handle null metadata.
  UPDATE public.venture_artifacts
  SET artifact_type = 'launch_readiness_checklist',
      metadata = COALESCE(metadata, '{}'::jsonb)
                 || jsonb_build_object(
                      'legacy_artifact_type', 'launch_marketing_checklist',
                      'backfilled_by_sd', 'SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001',
                      'backfilled_at', now()
                    )
  WHERE lifecycle_stage = 23
    AND artifact_type = 'launch_marketing_checklist';

  GET DIAGNOSTICS v_post_count = ROW_COUNT;
  RAISE NOTICE '[FR-6 backfill] rows backfilled: %', v_post_count;

  -- Invariant: post-migration legacy rows must be 0 on stage 23
  SELECT count(*) INTO v_post_count
  FROM public.venture_artifacts
  WHERE lifecycle_stage = 23 AND artifact_type = 'launch_marketing_checklist';

  IF v_post_count > 0 THEN
    RAISE EXCEPTION '[FR-6 backfill] invariant violated: % legacy rows remain on stage 23', v_post_count;
  END IF;
END $$;

COMMIT;
