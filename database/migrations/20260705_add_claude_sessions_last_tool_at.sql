-- ============================================================================
-- Migration: Add claude_sessions.last_tool_at — tick-immune tool-activity clock
-- Date: 2026-07-05
-- SD: SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 (FR-1)
--
-- Purpose: heartbeat_at and process_alive_at are both PATCHed every 30s by the
--          session-tick daemon (scripts/session-tick.cjs) regardless of tool
--          activity, so a prompt-blocked window keeps both fresh — the exact
--          reason the 2026-07-04→05 claim-boundary freezes were invisible.
--          last_tool_at moves ONLY when a tool call actually completes.
-- ============================================================================

ALTER TABLE claude_sessions ADD COLUMN IF NOT EXISTS last_tool_at TIMESTAMPTZ;

COMMENT ON COLUMN claude_sessions.last_tool_at IS
  'Tick-immune tool-activity clock. SINGLE-WRITER CONTRACT: written ONLY by the '
  'PostToolUse hook scripts/hooks/post-tool-clear-telemetry.cjs (fires on every '
  'tool call) via the writeTelemetry allowlist in session-telemetry-writer.cjs. '
  'session-tick.cjs and writeTelemetryAwait MUST NOT write it — tick-immunity is '
  'the column''s entire value (heartbeat_at/process_alive_at are tick-contaminated '
  'and lie during window-level prompt blocks). NULL = session predates the hook '
  'rollout; consumers MUST treat NULL as UNKNOWN, never as frozen. Primary '
  'consumer: claim-boundary pre-flight probe in stale-session-sweep.cjs '
  '(SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001).';
