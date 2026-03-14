-- Heartbeat Intelligence Protocol
-- SD: SD-MAN-INFRA-WORKER-WORKTREE-SELF-001
-- Adds 3 telemetry columns to claude_sessions for fleet coordinator intelligence

-- 1. Add columns
ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS has_uncommitted_changes boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS handoff_fail_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_phase text DEFAULT NULL;

COMMENT ON COLUMN claude_sessions.has_uncommitted_changes IS 'True if worker has uncommitted git changes. NULL = unknown (pre-upgrade session). Used as release guard.';
COMMENT ON COLUMN claude_sessions.handoff_fail_count IS 'Count of failed handoff attempts on current SD. Reset on SD change or success. >3 triggers WORKER_STRUGGLING.';
COMMENT ON COLUMN claude_sessions.current_phase IS 'Normalized phase: LEAD, PLAN, or EXEC. Derived from strategic_directives_v2.current_phase. NULL if no SD claimed.';

-- 2. Fleet telemetry weekly aggregate view
CREATE OR REPLACE VIEW fleet_telemetry_weekly AS
SELECT
  date_trunc('week', cs.heartbeat_at) AS week_start,
  COUNT(DISTINCT cs.session_id) AS total_sessions,
  COUNT(DISTINCT cs.session_id) FILTER (WHERE cs.has_uncommitted_changes = true) AS wip_sessions,
  COUNT(DISTINCT cs.session_id) FILTER (WHERE cs.handoff_fail_count > 3) AS struggling_sessions,
  ROUND(AVG(cs.handoff_fail_count)::numeric, 1) AS avg_fail_count,
  SUM(EXTRACT(EPOCH FROM (COALESCE(cs.released_at, NOW()) - cs.created_at)) / 3600)::numeric(10,1) AS total_session_hours,
  COUNT(DISTINCT cs.current_branch) FILTER (WHERE cs.current_branch IS NOT NULL AND cs.current_branch != 'main') AS unique_branches
FROM claude_sessions cs
WHERE cs.heartbeat_at >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('week', cs.heartbeat_at)
HAVING SUM(EXTRACT(EPOCH FROM (COALESCE(cs.released_at, NOW()) - cs.created_at)) / 3600) >= 10
ORDER BY week_start DESC;

COMMENT ON VIEW fleet_telemetry_weekly IS 'Weekly aggregate of fleet telemetry for EVA Friday reporting. Only includes weeks with >=10 heartbeat-hours.';
