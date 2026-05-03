-- ============================================================================
-- SD-LEO-FIX-FIX-S10-WORKER-001 FR-003
-- Backfill venture_artifacts for ventures affected by the S10 worker's
-- mis-tagging of identity_brand_guidelines.
--
-- Origin: 2026-05-03 PrivacyPatrol AI venture monitoring revealed S12 missing
-- identity_brand_guidelines because the S10 worker emitted it at S10 with a
-- copy-paste artifact_type defect on the personas write.
--
-- Two-step transactional pattern (per database-agent finding eade22bf-3816-...):
-- venture_artifacts has UNIQUE INDEX idx_unique_current_artifact ON
-- (venture_id, lifecycle_stage, artifact_type, COALESCE(metadata->>'screenId',
-- '__no_screen__')) WHERE is_current=true. A naive UPDATE that flips
-- artifact_type or lifecycle_stage moves the row into a different bucket and
-- collides with any pre-existing is_current=true row at the destination key.
--
-- For PrivacyPatrol AI live data: the persona row 764b1fe0-... cannot relabel
-- to (S10, identity_persona_brand) because conflict row 896d546a-... already
-- holds that key with is_current=true. Step A deactivates the conflict; Step B
-- relabels the persona; Step C is forward-compat for any future Brand Genome
-- rows (currently 0 affected).
--
-- Idempotency: WHERE filters self-deactivate after migration. Re-run produces
-- 0 row updates. No state table needed.
--
-- Down-migration recipe (emergency rollback):
--   BEGIN;
--     -- Reverse Step C: any S12 identity_brand_guidelines from Brand Genome
--     UPDATE venture_artifacts SET lifecycle_stage=10
--      WHERE artifact_type='identity_brand_guidelines' AND lifecycle_stage=12
--        AND source='stage-10-analysis' AND title LIKE 'Brand Genome%';
--     -- Reverse Step B: persona rows back to identity_brand_guidelines
--     UPDATE venture_artifacts SET artifact_type='identity_brand_guidelines'
--      WHERE artifact_type='identity_persona_brand' AND lifecycle_stage=10
--        AND source='stage-10-analysis' AND title LIKE 'Customer Personas%';
--     -- Reverse Step A: re-activate conflict rows (lossy — only if data
--     -- preservation is required; for cleanest reversal, leave deactivated)
--     UPDATE venture_artifacts SET is_current=true WHERE id='896d546a-8cad-4335-b2e6-e4c6dd6dc1f5';
--   COMMIT;
-- ============================================================================

BEGIN;

-- Step A: Deactivate the known is_current=true conflict row at PrivacyPatrol AI
-- so Step B's relabel can land at (S10, identity_persona_brand) without
-- colliding on idx_unique_current_artifact.
--
-- This row was the second writeArtifact call's output from the same buggy
-- worker run (0.3s after row 764b1fe0). It carries identical data shape
-- (Customer Personas at S10) but is the *current* row per the unique index.
-- Deactivation preserves its data; the relabeled row 764b1fe0 takes over the
-- is_current=true slot.
UPDATE venture_artifacts
   SET is_current = false,
       updated_at = NOW()
 WHERE id = '896d546a-8cad-4335-b2e6-e4c6dd6dc1f5'
   AND is_current = true;

-- Step B: Relabel persona candidates from identity_brand_guidelines (the
-- pre-fix mis-tag) to identity_persona_brand (the canonical S10 type per
-- artifact-types.js:214). lifecycle_stage stays 10 (correct per registry).
-- Title-pattern discrimination is unambiguous (per database-agent: 0
-- unmatched rows in candidate set).
UPDATE venture_artifacts
   SET artifact_type = 'identity_persona_brand',
       updated_at = NOW()
 WHERE artifact_type = 'identity_brand_guidelines'
   AND lifecycle_stage = 10
   AND source = 'stage-10-analysis'
   AND title LIKE 'Customer Personas%';

-- Step C: Relocate Brand Genome from S10 to S12 (its DB-authoritative storage
-- stage per lifecycle_stage_config.required_artifacts[12]). artifact_type
-- stays identity_brand_guidelines (correct per registry). Currently 0 rows
-- match (database-agent finding); this clause is forward-compat for any
-- Brand Genome rows that exist at S10 in deployments older than this fix.
UPDATE venture_artifacts
   SET lifecycle_stage = 12,
       updated_at = NOW()
 WHERE artifact_type = 'identity_brand_guidelines'
   AND lifecycle_stage = 10
   AND source = 'stage-10-analysis'
   AND title LIKE 'Brand Genome%';

-- Post-flight assertion: count rows still matching the pre-fix shape. After a
-- successful apply, this should be 0. Comment out for production if you don't
-- want a hard-stop on partial state; uncomment for staging validation.
--
-- DO $$
-- DECLARE
--   v_remaining INT;
-- BEGIN
--   SELECT COUNT(*) INTO v_remaining
--   FROM venture_artifacts
--   WHERE artifact_type = 'identity_brand_guidelines'
--     AND lifecycle_stage = 10
--     AND source = 'stage-10-analysis';
--   IF v_remaining <> 0 THEN
--     RAISE EXCEPTION 'Backfill incomplete: % rows still match pre-fix shape', v_remaining;
--   END IF;
-- END $$;

COMMIT;
