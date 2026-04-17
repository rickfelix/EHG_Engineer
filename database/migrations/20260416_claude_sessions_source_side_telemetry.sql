-- =============================================================================
-- SD-LEO-INFRA-WORKER-SOURCE-SIDE-001 — Worker Source-Side Telemetry
-- =============================================================================
-- Adds rich heartbeat / expected-silence / tick-alive signals to claude_sessions
-- so fleet sweep can replace sink-side inference with source-side measurement.
--
-- Columns added (all NULL-tolerant — graceful degradation for legacy sessions):
--   current_tool                 TEXT           Name of currently executing tool
--   current_tool_args_hash       TEXT           SHA-256 (first 16 chars) of tool args for audit
--   current_tool_expected_end_at TIMESTAMPTZ    When the current tool should finish (timeout + 30s)
--   last_activity_kind           TEXT           Worker's current state (CHECK-constrained)
--   commits_since_claim          INT            Git commits on branch since claimed_at
--   files_modified_since_claim   INT            Files touched since claimed_at
--   process_alive_at             TIMESTAMPTZ    Background tick timestamp — authoritative liveness
--   expected_silence_until       TIMESTAMPTZ    Worker-declared silent period (≤30m, enforced by sweep)
--
-- Indexes:
--   idx_claude_sessions_process_alive       DESC on process_alive_at (sweep hot path)
--   idx_claude_sessions_expected_silence    expected_silence_until (sweep hot path)
--
-- Backward compatibility:
--   ALL new columns are nullable and readers MUST treat NULL as "information
--   not available" — legacy behavior is preserved.
-- =============================================================================

BEGIN;

ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS current_tool                 TEXT,
  ADD COLUMN IF NOT EXISTS current_tool_args_hash       TEXT,
  ADD COLUMN IF NOT EXISTS current_tool_expected_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_kind           TEXT,
  ADD COLUMN IF NOT EXISTS commits_since_claim          INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_modified_since_claim   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS process_alive_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_silence_until       TIMESTAMPTZ;

-- CHECK constraint on last_activity_kind (added separately so re-runs don't fail)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'claude_sessions_last_activity_kind_check'
  ) THEN
    ALTER TABLE claude_sessions
      ADD CONSTRAINT claude_sessions_last_activity_kind_check
      CHECK (last_activity_kind IS NULL OR last_activity_kind IN (
        'executing',
        'waiting_tool',
        'waiting_agent',
        'thinking',
        'idle',
        'exiting'
      ));
  END IF;
END $$;

COMMIT;

-- Indexes created CONCURRENTLY to avoid blocking writers (outside transaction)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_claude_sessions_process_alive
  ON claude_sessions (process_alive_at DESC)
  WHERE process_alive_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_claude_sessions_expected_silence
  ON claude_sessions (expected_silence_until)
  WHERE expected_silence_until IS NOT NULL;

-- =============================================================================
-- Column comments (documentation lives with the schema)
-- =============================================================================

COMMENT ON COLUMN claude_sessions.current_tool IS
  'Name of the tool the worker is currently executing (Bash, Agent, Edit, etc). NULL when idle.';

COMMENT ON COLUMN claude_sessions.current_tool_args_hash IS
  'SHA-256 (first 16 hex chars) of the tool arguments — audit trail without leaking args.';

COMMENT ON COLUMN claude_sessions.current_tool_expected_end_at IS
  'Timestamp when the current tool should complete (tool.timeout + 30s buffer). Used by sweep to skip release.';

COMMENT ON COLUMN claude_sessions.last_activity_kind IS
  'Worker state: executing (short tool), waiting_tool (long tool), waiting_agent, thinking, idle, exiting.';

COMMENT ON COLUMN claude_sessions.commits_since_claim IS
  'Git commits on SD branch since claimed_at (throttled 30s in PostToolUse).';

COMMENT ON COLUMN claude_sessions.files_modified_since_claim IS
  'Files modified since claimed_at (throttled 30s in PostToolUse).';

COMMENT ON COLUMN claude_sessions.process_alive_at IS
  'Last tick from detached session-tick.cjs process. Authoritative liveness — if < 90s old, worker is alive.';

COMMENT ON COLUMN claude_sessions.expected_silence_until IS
  'Worker-declared silent period (Bash timeout, Agent invocation). Sweep enforces 30-minute hard cap — values beyond that are IGNORED to prevent masking dead workers.';

-- =============================================================================
-- DOWN migration (manual rollback — run this block to revert)
-- =============================================================================
-- BEGIN;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_claude_sessions_expected_silence;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_claude_sessions_process_alive;
-- ALTER TABLE claude_sessions
--   DROP CONSTRAINT IF EXISTS claude_sessions_last_activity_kind_check,
--   DROP COLUMN IF EXISTS expected_silence_until,
--   DROP COLUMN IF EXISTS process_alive_at,
--   DROP COLUMN IF EXISTS files_modified_since_claim,
--   DROP COLUMN IF EXISTS commits_since_claim,
--   DROP COLUMN IF EXISTS last_activity_kind,
--   DROP COLUMN IF EXISTS current_tool_expected_end_at,
--   DROP COLUMN IF EXISTS current_tool_args_hash,
--   DROP COLUMN IF EXISTS current_tool;
-- COMMIT;
