-- Migration: Create permission_audit_log table
-- SD: SD-LEO-INFRA-LEO-PRIMITIVE-PARITY-001-C
-- Purpose: Centralized audit trail for all tool permission enforcement decisions
-- made by pre-tool-enforce.cjs (PreToolUse hook). Async fire-and-forget writes
-- ensure enforcement latency is not impacted.

CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  rule_code TEXT NOT NULL,
  rule_description TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('allow', 'block', 'override', 'warn')),
  context_hash TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Index for querying by session (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_permission_audit_session
  ON permission_audit_log(session_id);

-- Index for time-range queries and TTL cleanup
CREATE INDEX IF NOT EXISTS idx_permission_audit_created
  ON permission_audit_log(created_at);

-- Index for filtering by outcome (e.g. all blocks in a session)
CREATE INDEX IF NOT EXISTS idx_permission_audit_outcome
  ON permission_audit_log(outcome);

-- Add table comment for documentation
COMMENT ON TABLE permission_audit_log IS
  'Audit trail for tool permission enforcement decisions. Written async (fire-and-forget) by pre-tool-enforce.cjs hook. Never blocks enforcement.';

COMMENT ON COLUMN permission_audit_log.session_id IS
  'Claude Code session identifier (from SESSION_ID env var or generated)';

COMMENT ON COLUMN permission_audit_log.tool_name IS
  'Name of the tool that was evaluated (e.g. Bash, mcp__supabase__apply_migration)';

COMMENT ON COLUMN permission_audit_log.rule_code IS
  'Enforcement rule code that triggered the decision (e.g. BLOCK_APPLY_MIGRATION)';

COMMENT ON COLUMN permission_audit_log.outcome IS
  'Enforcement decision: allow, block, override, or warn';

COMMENT ON COLUMN permission_audit_log.context_hash IS
  'SHA-256 (truncated to 16 chars) of the tool input JSON for correlation';

COMMENT ON COLUMN permission_audit_log.metadata IS
  'Additional context: tool input snippet, rule details, override reason, etc.';
