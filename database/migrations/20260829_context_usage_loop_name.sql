-- SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (FR-2, FR-4)
--
-- Adds a nullable loop_name column to context_usage_log so cache-read series are queryable per
-- recurring task an interactive Claude Code session identifies itself as running (a /loop-driven
-- fleet worker's check-in cycle, a CronCreate-driven session), and two thin views: per-seat
-- (already derivable via session_id -> claude_sessions) and per-loop (once loop_name is
-- populated). Purely additive -- no existing column, constraint, or RLS policy changes.

ALTER TABLE context_usage_log
  ADD COLUMN IF NOT EXISTS loop_name text;

CREATE OR REPLACE VIEW v_context_usage_by_seat AS
SELECT
  cul.session_id,
  cs.hostname,
  cs.status AS session_status,
  cul.timestamp,
  cul.model_id,
  cul.usage_percent,
  cul.cache_read_tokens,
  cul.cache_creation_tokens
FROM context_usage_log cul
LEFT JOIN claude_sessions cs ON cs.session_id = cul.session_id
ORDER BY cul.timestamp DESC;

CREATE OR REPLACE VIEW v_context_usage_by_loop AS
SELECT
  loop_name,
  session_id,
  timestamp,
  model_id,
  usage_percent,
  cache_read_tokens,
  cache_creation_tokens
FROM context_usage_log
WHERE loop_name IS NOT NULL
ORDER BY timestamp DESC;
