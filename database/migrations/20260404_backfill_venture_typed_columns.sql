-- Migration: Backfill venture typed columns from metadata.stage_zero
-- SD: SD-MAN-ORCH-CLI-FRONTEND-PIPELINE-001-B
-- Purpose: Copy data from metadata->stage_zero JSONB to typed columns
--          for ventures where typed columns are NULL but metadata has values.
-- Safety: Additive only (NULL to value). Idempotent. Reversible.

BEGIN;

-- 1. solution (text)
UPDATE ventures
SET solution = metadata->'stage_zero'->>'solution'
WHERE solution IS NULL
  AND metadata->'stage_zero'->>'solution' IS NOT NULL;

-- 2. raw_chairman_intent (text)
UPDATE ventures
SET raw_chairman_intent = metadata->'stage_zero'->>'raw_chairman_intent'
WHERE raw_chairman_intent IS NULL
  AND metadata->'stage_zero'->>'raw_chairman_intent' IS NOT NULL;

-- 3. moat_strategy (jsonb) — need to cast from text
UPDATE ventures
SET moat_strategy = (metadata->'stage_zero'->'moat_strategy')::jsonb
WHERE moat_strategy IS NULL
  AND metadata->'stage_zero'->'moat_strategy' IS NOT NULL
  AND jsonb_typeof(metadata->'stage_zero'->'moat_strategy') IS NOT NULL;

-- 4. portfolio_synergy_score (numeric, 0-1 range)
UPDATE ventures
SET portfolio_synergy_score = CASE
    WHEN (metadata->'stage_zero'->>'portfolio_synergy_score')::numeric > 1
    THEN (metadata->'stage_zero'->>'portfolio_synergy_score')::numeric / 100.0
    ELSE (metadata->'stage_zero'->>'portfolio_synergy_score')::numeric
  END
WHERE portfolio_synergy_score IS NULL
  AND metadata->'stage_zero'->>'portfolio_synergy_score' IS NOT NULL;

-- 5. time_horizon_classification (text)
UPDATE ventures
SET time_horizon_classification = metadata->'stage_zero'->>'time_horizon_classification'
WHERE time_horizon_classification IS NULL
  AND metadata->'stage_zero'->>'time_horizon_classification' IS NOT NULL;

-- 6. build_estimate (jsonb)
UPDATE ventures
SET build_estimate = (metadata->'stage_zero'->'build_estimate')::jsonb
WHERE build_estimate IS NULL
  AND metadata->'stage_zero'->'build_estimate' IS NOT NULL
  AND jsonb_typeof(metadata->'stage_zero'->'build_estimate') IS NOT NULL;

-- 7. discovery_strategy (text)
UPDATE ventures
SET discovery_strategy = metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy'
WHERE discovery_strategy IS NULL
  AND metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' IS NOT NULL;

COMMIT;
