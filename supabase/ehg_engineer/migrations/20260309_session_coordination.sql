-- Session Coordination Table
-- Enables cross-session messaging for fleet coordination.
-- Written by orchestrator sessions, read by worker sessions via PostToolUse hook.

-- Message type enum
DO $$ BEGIN
  CREATE TYPE coordination_message_type AS ENUM (
    'CLAIM_RELEASED',       -- Your claim was released (conflict/stale)
    'WORK_ASSIGNMENT',      -- Pick up this SD next
    'SD_BLOCKED',           -- An SD you depend on is blocked
    'SD_COMPLETED_NEARBY',  -- A related SD just completed
    'PRIORITY_CHANGE',      -- Priority shifted, consider switching
    'INFO'                  -- General coordination info
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS session_coordination (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Targeting: at least one must be set
  target_session  text,             -- Specific session_id (NULL = broadcast)
  target_sd       text,             -- Target SD key (NULL = not SD-specific)

  -- Message content
  message_type    coordination_message_type NOT NULL DEFAULT 'INFO',
  subject         text NOT NULL,    -- Short summary (displayed in hook output)
  body            text,             -- Detailed message
  payload         jsonb DEFAULT '{}',  -- Structured data (suggested_sd, available_sds, etc.)

  -- Sender
  sender_session  text,             -- Session that sent this message
  sender_type     text DEFAULT 'orchestrator',  -- orchestrator, sweep, manual

  -- Lifecycle
  created_at      timestamptz DEFAULT now() NOT NULL,
  expires_at      timestamptz DEFAULT (now() + interval '1 hour'),  -- Auto-expire after 1 hour
  read_at         timestamptz,      -- When the target session first saw it
  acknowledged_at timestamptz,      -- When the target session acted on it

  -- Constraints
  CONSTRAINT valid_target CHECK (target_session IS NOT NULL OR target_sd IS NOT NULL)
);

-- Indexes for fast lookup by workers
CREATE INDEX IF NOT EXISTS idx_coord_target_session
  ON session_coordination (target_session)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coord_target_sd
  ON session_coordination (target_sd)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coord_unread
  ON session_coordination (created_at DESC)
  WHERE read_at IS NULL;

-- Auto-cleanup: delete expired messages
CREATE INDEX IF NOT EXISTS idx_coord_expires
  ON session_coordination (expires_at)
  WHERE expires_at IS NOT NULL;

-- RLS
ALTER TABLE session_coordination ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (hooks use service key)
CREATE POLICY "service_role_full_access" ON session_coordination
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Cleanup function: remove expired messages
CREATE OR REPLACE FUNCTION cleanup_expired_coordination()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM session_coordination
  WHERE expires_at < now()
  RETURNING 1 INTO deleted_count;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON TABLE session_coordination IS 'Cross-session messaging for fleet coordination. Written by orchestrator/sweep, read by worker hooks.';
