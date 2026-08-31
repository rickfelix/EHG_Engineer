-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-LEO-PHASE-TAGGED-001 (FR-1/FR-3)
--
-- Adds nullable sd_key and leo_phase columns to context_usage_log so token burn becomes
-- queryable per SD and per LEO phase (previously only loop_name -- a recurring-task label,
-- a different axis -- and session_id/working_directory existed). Values are written at
-- source (context-usage-feed.cjs's buildUsageEntry(), reading a per-worktree state file
-- kept current by sd-start.js/handoff.js), never joined retroactively -- claude_sessions.sd_key
-- is a point-in-time claim field, not historical per-snapshot data, so a retroactive join
-- would misattribute tokens for a long-lived session that touches multiple SDs sequentially.
-- Purely additive -- no existing column, constraint, or RLS policy change.
--
-- The application code (scripts/sync-context-usage.js) fails soft (PGRST204 fallback, mirroring
-- the existing loop_name handling) when these columns are not yet present, so applying this
-- migration is not a precondition for the rest of this SD's code to function.

ALTER TABLE context_usage_log
  ADD COLUMN IF NOT EXISTS sd_key text,
  ADD COLUMN IF NOT EXISTS leo_phase text;

-- SECURITY finding (evidence 15c8c79e, carried from 20260829_context_usage_loop_name.sql):
-- security_invoker=on so this view runs under the querying user's RLS, not the view owner's.
CREATE OR REPLACE VIEW v_context_usage_by_sd_phase
  WITH (security_invoker = on) AS
SELECT
  sd_key,
  leo_phase,
  session_id,
  timestamp,
  model_id,
  usage_percent,
  input_tokens,
  output_tokens,
  cache_creation_tokens,
  cache_read_tokens
FROM context_usage_log
WHERE sd_key IS NOT NULL AND leo_phase IS NOT NULL
ORDER BY timestamp DESC;

-- FR-4: gap visibility. Driven from sd_phase_handoffs (the denominator of phase attempts
-- that actually happened), LEFT JOINed against tagged context_usage_log rows -- a phase
-- attempt with zero rows still appears here with instrumentation_gap=true, rather than
-- being silently absent the way a plain GROUP BY over context_usage_log alone would be
-- (LEAD-phase VALIDATION confirmed today's aggregation functions silently omit zero-row
-- groups; this view exists specifically so that failure mode cannot repeat for this data).
CREATE OR REPLACE VIEW v_leo_phase_telemetry_gaps
  WITH (security_invoker = on) AS
WITH phase_attempts AS (
  SELECT DISTINCT
    sd.sd_key,
    h.to_phase AS leo_phase
  FROM sd_phase_handoffs h
  JOIN strategic_directives_v2 sd ON sd.id = h.sd_id
  WHERE h.to_phase IS NOT NULL
),
usage_counts AS (
  SELECT sd_key, leo_phase, COUNT(*) AS row_count
  FROM context_usage_log
  WHERE sd_key IS NOT NULL AND leo_phase IS NOT NULL
  GROUP BY sd_key, leo_phase
)
SELECT
  pa.sd_key,
  pa.leo_phase,
  COALESCE(uc.row_count, 0) AS context_usage_row_count,
  (COALESCE(uc.row_count, 0) = 0) AS instrumentation_gap
FROM phase_attempts pa
LEFT JOIN usage_counts uc ON uc.sd_key = pa.sd_key AND uc.leo_phase = pa.leo_phase
ORDER BY instrumentation_gap DESC, pa.sd_key, pa.leo_phase;
