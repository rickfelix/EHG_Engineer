-- SD-MAN-FIX-FIX-FRONTEND-VENTURE-001: Backfill typed columns from metadata.stage_zero
-- For ventures created before the CLI fix (SD-LEO-FIX-FIX-STAGE-VENTURE-001) that have
-- data in metadata->stage_zero but NULL typed columns.
-- NOTE: moat_strategy and build_estimate are JSONB columns, so use -> (not ->>) to preserve type.

UPDATE ventures
SET
  solution = COALESCE(solution, metadata->'stage_zero'->>'solution'),
  raw_chairman_intent = COALESCE(raw_chairman_intent, metadata->'stage_zero'->>'raw_chairman_intent'),
  archetype = COALESCE(archetype, metadata->'stage_zero'->>'archetype'),
  moat_strategy = COALESCE(moat_strategy, metadata->'stage_zero'->'moat_strategy'),
  portfolio_synergy_score = COALESCE(
    portfolio_synergy_score,
    (metadata->'stage_zero'->>'portfolio_synergy_score')::numeric
  ),
  time_horizon_classification = COALESCE(time_horizon_classification, metadata->'stage_zero'->>'time_horizon_classification'),
  build_estimate = COALESCE(build_estimate, metadata->'stage_zero'->'build_estimate'),
  discovery_strategy = COALESCE(
    discovery_strategy,
    metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy'
  ),
  target_market = COALESCE(target_market, metadata->'stage_zero'->>'target_market')
WHERE
  metadata->'stage_zero' IS NOT NULL
  AND (
    solution IS NULL
    OR raw_chairman_intent IS NULL
    OR archetype IS NULL
    OR moat_strategy IS NULL
    OR portfolio_synergy_score IS NULL
    OR time_horizon_classification IS NULL
    OR build_estimate IS NULL
    OR discovery_strategy IS NULL
  );
