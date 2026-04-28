-- Migration: get_discovery_strategy_scores RPC — version-aware grouping
-- SD: SD-LEO-ENH-TREND-SCANNER-SCORING-001 (FR-6, AC-4, TR-5, PA-003 BLOCKING)
-- Purpose: Replace the v1 RPC with a version-aware variant that groups by
--          (strategy, COALESCE(prompt_version, 'v1-pre-versioning')) and returns
--          prompt_version as a NEW TABLE column.
--
-- ─── PA-003 BLOCKING CONSTRAINT (TR-5) ─────────────────────────────────────────
-- prompt_version MUST be added as a NEW TABLE column with COALESCE default,
-- NOT as a raw second GROUP BY column inserted into the existing SELECT shape.
-- useDiscoveryStrategyScores.ts is typed as flat StrategyScore[]; raw shape change
-- would break consumers. The COALESCE-with-new-column form preserves wide-row
-- compatibility — older callers ignore the extra field; new callers read it.
-- ────────────────────────────────────────────────────────────────────────────────
--
-- ─── DEPLOY ORDER (TR-3, BLOCKING) ─────────────────────────────────────────────
-- This migration MUST run AFTER 20260428_stage_zero_prompt_version.sql so the
-- ventures.metadata.stage_zero.origin_metadata.prompt_version JSONB key exists in
-- the read-side schema (the migration above adds the typed columns; the RPC reads
-- the JSONB key which is additive and requires no schema change on ventures).
-- ────────────────────────────────────────────────────────────────────────────────

-- DO NOT EDIT the prior 20260313_discovery_strategy_scores.sql migration. We use
-- CREATE OR REPLACE on the function to preserve the existing function signature
-- across upgrade paths; the RETURNS TABLE contract gains one new column.

CREATE OR REPLACE FUNCTION get_discovery_strategy_scores()
RETURNS TABLE (
  strategy TEXT,
  prompt_version TEXT,         -- NEW column (FR-6 / TR-5 / PA-003)
  venture_count BIGINT,
  total_outcomes BIGINT,
  pass_count BIGINT,
  pass_rate NUMERIC,
  avg_score NUMERIC,
  composite_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' AS strategy,
    -- COALESCE legacy NULLs to a single sentinel so they aggregate together rather
    -- than appearing as a NULL row in the result. Sentinel matches LEGACY_PROMPT_VERSION_SENTINEL
    -- in lib/eva/stage-zero/paths/discovery-mode-versions.js.
    COALESCE(
      v.metadata->'stage_zero'->'origin_metadata'->>'prompt_version',
      'v1-pre-versioning'
    ) AS prompt_version,
    COUNT(DISTINCT v.id) AS venture_count,
    COUNT(epo.id) AS total_outcomes,
    COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END) AS pass_count,
    ROUND(
      COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC
      / NULLIF(COUNT(epo.id), 0), 3
    ) AS pass_rate,
    ROUND(AVG((epo.outcome->>'score')::NUMERIC), 2) AS avg_score,
    ROUND(
      0.7 * (COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC
             / NULLIF(COUNT(epo.id), 0))
      + 0.3 * (AVG((epo.outcome->>'score')::NUMERIC) / 10.0),
    3) AS composite_score
  FROM ventures v
  JOIN evaluation_profile_outcomes epo ON epo.venture_id = v.id
  WHERE v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' IS NOT NULL
    AND v.status NOT IN ('cancelled', 'archived')
    AND (epo.outcome->>'simulated')::BOOLEAN IS DISTINCT FROM TRUE
  GROUP BY
    v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy',
    COALESCE(
      v.metadata->'stage_zero'->'origin_metadata'->>'prompt_version',
      'v1-pre-versioning'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_discovery_strategy_scores() TO authenticated;

COMMENT ON FUNCTION get_discovery_strategy_scores() IS
  'Aggregates discovery strategy performance from evaluation gate outcomes, grouped by (strategy, prompt_version). Legacy NULL prompt_version rows surface as ''v1-pre-versioning''. Used by DiscoveryModeDialog star ratings (latest version wins for a given strategy until UI surfacing SD lands). Set by SD-LEO-ENH-TREND-SCANNER-SCORING-001.';

-- ─── DOWN ──────────────────────────────────────────────────────────────────────
-- To revert this RPC change while keeping the typed columns intact:
--   CREATE OR REPLACE FUNCTION get_discovery_strategy_scores()
--   RETURNS TABLE (... prior 7-column shape ...) AS $$ ... $$ LANGUAGE plpgsql ...;
-- Re-run the prior migration body from 20260313_discovery_strategy_scores.sql.
-- ehg/ consumers continue to work — the StrategyScore extension was additive.
-- ────────────────────────────────────────────────────────────────────────────────
