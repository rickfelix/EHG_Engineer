-- LEO Error Log Table
-- SD-GENESIS-V32-PULSE: P0 Fix - Create missing leo_error_log table
-- This table stores critical errors that need operator attention

-- Drop table if it exists (for clean recreation)
DROP TABLE IF EXISTS leo_error_log CASCADE;

-- Create the leo_error_log table
CREATE TABLE leo_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Error context
  error_type TEXT NOT NULL CHECK (error_type IN (
    'API_FAILURE',       -- External API call failed after retries
    'DATABASE_ERROR',    -- Database operation failed
    'VALIDATION_ERROR',  -- Data validation failed
    'SYSTEM_ERROR',      -- Internal system error
    'NETWORK_ERROR',     -- Network connectivity issues
    'AUTH_ERROR',        -- Authentication/authorization failures
    'CIRCUIT_BREAKER',   -- Circuit breaker tripped
    'TIMEOUT',           -- Operation timeout
    'RATE_LIMIT',        -- Rate limit exceeded
    'UNKNOWN'            -- Unclassified error
  )),

  -- Error details
  error_message TEXT NOT NULL,
  error_code TEXT,                          -- HTTP status or error code
  error_stack TEXT,                         -- Stack trace if available

  -- Context information
  sd_id TEXT,                               -- Strategic Directive if applicable
  operation TEXT NOT NULL,                  -- What was being attempted
  component TEXT NOT NULL,                  -- Which module/component failed
  attempt_count INTEGER DEFAULT 1,          -- Number of retry attempts made

  -- Recovery information
  is_recoverable BOOLEAN DEFAULT true,      -- Can this error be retried?
  recovery_guidance TEXT,                   -- Human-readable recovery steps
  suggested_action TEXT,                    -- Automated suggested action

  -- Additional context as JSONB
  context JSONB DEFAULT '{}',               -- Additional metadata (request payload, headers, etc.)

  -- Severity and status
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN (
    'critical',  -- Requires immediate attention
    'error',     -- Standard error
    'warning',   -- Potential issue
    'info'       -- Informational
  )),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',       -- Just logged
    'ack',       -- Acknowledged by operator
    'resolved',  -- Issue resolved
    'ignored'    -- Marked as ignorable
  )),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  -- Session tracking
  session_id TEXT,                          -- LEO session identifier
  user_id UUID                              -- User if applicable
);

-- Create indexes for common queries
CREATE INDEX idx_leo_error_log_type ON leo_error_log(error_type);
CREATE INDEX idx_leo_error_log_severity ON leo_error_log(severity);
CREATE INDEX idx_leo_error_log_status ON leo_error_log(status);
CREATE INDEX idx_leo_error_log_sd_id ON leo_error_log(sd_id);
CREATE INDEX idx_leo_error_log_created_at ON leo_error_log(created_at DESC);
CREATE INDEX idx_leo_error_log_component ON leo_error_log(component);
CREATE INDEX idx_leo_error_log_unresolved ON leo_error_log(status) WHERE status IN ('new', 'ack');

-- Enable RLS
ALTER TABLE leo_error_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role can do everything
CREATE POLICY "leo_error_log_service_all" ON leo_error_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view errors (read-only)
CREATE POLICY "leo_error_log_auth_select" ON leo_error_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_leo_error_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leo_error_log_updated_at
  BEFORE UPDATE ON leo_error_log
  FOR EACH ROW
  EXECUTE FUNCTION update_leo_error_log_updated_at();

-- Helper function to log critical errors
CREATE OR REPLACE FUNCTION log_critical_error(
  p_error_type TEXT,
  p_error_message TEXT,
  p_operation TEXT,
  p_component TEXT,
  p_context JSONB DEFAULT '{}',
  p_sd_id TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_stack TEXT DEFAULT NULL,
  p_attempt_count INTEGER DEFAULT 1,
  p_is_recoverable BOOLEAN DEFAULT true,
  p_recovery_guidance TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_error_id UUID;
BEGIN
  INSERT INTO leo_error_log (
    error_type,
    error_message,
    error_code,
    error_stack,
    operation,
    component,
    context,
    sd_id,
    attempt_count,
    is_recoverable,
    recovery_guidance,
    session_id,
    severity
  ) VALUES (
    p_error_type,
    p_error_message,
    p_error_code,
    p_error_stack,
    p_operation,
    p_component,
    p_context,
    p_sd_id,
    p_attempt_count,
    p_is_recoverable,
    p_recovery_guidance,
    p_session_id,
    CASE
      WHEN p_is_recoverable = false THEN 'critical'
      WHEN p_attempt_count >= 3 THEN 'error'
      ELSE 'warning'
    END
  )
  RETURNING id INTO v_error_id;

  RETURN v_error_id;
END;
$$;

-- Function to get recent critical errors
CREATE OR REPLACE FUNCTION get_recent_errors(
  p_limit INTEGER DEFAULT 10,
  p_severity TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'new'
)
RETURNS TABLE (
  id UUID,
  error_type TEXT,
  error_message TEXT,
  operation TEXT,
  component TEXT,
  severity TEXT,
  status TEXT,
  attempt_count INTEGER,
  recovery_guidance TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.error_type,
    e.error_message,
    e.operation,
    e.component,
    e.severity,
    e.status,
    e.attempt_count,
    e.recovery_guidance,
    e.created_at
  FROM leo_error_log e
  WHERE (p_severity IS NULL OR e.severity = p_severity)
    AND (p_status IS NULL OR e.status = p_status)
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION log_critical_error TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_recent_errors TO authenticated, service_role;

-- Add table comment
COMMENT ON TABLE leo_error_log IS 'LEO Protocol error log for critical failures that need operator attention. Part of SD-GENESIS-V32-PULSE resilience infrastructure.';
