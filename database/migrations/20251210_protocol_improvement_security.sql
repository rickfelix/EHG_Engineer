-- ============================================================================
-- Protocol Improvement Security: RLS Policies and Audit Logging
-- Part of LEO Protocol self-improvement security layer
-- Date: 2025-12-10
-- ============================================================================

-- ============================================================================
-- SECTION 1: RLS Policies for protocol_improvement_queue
-- ============================================================================

-- Enable RLS on the table (if not already enabled)
ALTER TABLE IF EXISTS protocol_improvement_queue ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migration)
DROP POLICY IF EXISTS "protocol_improvement_queue_service_role_all" ON protocol_improvement_queue;
DROP POLICY IF EXISTS "protocol_improvement_queue_authenticated_select" ON protocol_improvement_queue;
DROP POLICY IF EXISTS "protocol_improvement_queue_anon_denied" ON protocol_improvement_queue;

-- Policy 1: service_role has full access
-- This allows the system to insert, update, and delete improvements
CREATE POLICY "protocol_improvement_queue_service_role_all"
ON protocol_improvement_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: authenticated users can only SELECT (view queue)
-- Users can see pending improvements but cannot modify them directly
CREATE POLICY "protocol_improvement_queue_authenticated_select"
ON protocol_improvement_queue
FOR SELECT
TO authenticated
USING (true);

-- Policy 3: anonymous users have no access
-- Anonymous access is explicitly denied
CREATE POLICY "protocol_improvement_queue_anon_denied"
ON protocol_improvement_queue
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- ============================================================================
-- SECTION 2: Audit Log Table for Protocol Improvements
-- ============================================================================

-- Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS protocol_improvement_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  improvement_id UUID REFERENCES protocol_improvement_queue(id) ON DELETE SET NULL,
  improvement_summary TEXT,
  target_table VARCHAR(100),
  actor_id TEXT,
  actor_type VARCHAR(20) DEFAULT 'system',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  details JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT valid_action CHECK (action IN (
    'CREATED',
    'APPROVED',
    'REJECTED',
    'APPLIED',
    'REVERTED',
    'EXPIRED',
    'VALIDATION_FAILED'
  )),
  CONSTRAINT valid_actor_type CHECK (actor_type IN ('system', 'user', 'automated'))
);

-- Index for querying by improvement_id
CREATE INDEX IF NOT EXISTS idx_audit_log_improvement_id
ON protocol_improvement_audit_log(improvement_id);

-- Index for querying by actor
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
ON protocol_improvement_audit_log(actor_id, actor_type);

-- Index for querying by timestamp (for recent activity)
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
ON protocol_improvement_audit_log(timestamp DESC);

-- Index for querying by action
CREATE INDEX IF NOT EXISTS idx_audit_log_action
ON protocol_improvement_audit_log(action);

-- ============================================================================
-- SECTION 3: RLS Policies for Audit Log
-- ============================================================================

-- Enable RLS
ALTER TABLE protocol_improvement_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "audit_log_service_role_all" ON protocol_improvement_audit_log;
DROP POLICY IF EXISTS "audit_log_authenticated_select" ON protocol_improvement_audit_log;

-- Policy 1: service_role has full access (for writing audit entries)
CREATE POLICY "audit_log_service_role_all"
ON protocol_improvement_audit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: authenticated users can only read audit logs
CREATE POLICY "audit_log_authenticated_select"
ON protocol_improvement_audit_log
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- SECTION 4: Audit Logging Function
-- ============================================================================

-- Function to log protocol improvement actions
CREATE OR REPLACE FUNCTION log_protocol_improvement_action(
  p_action VARCHAR(50),
  p_improvement_id UUID DEFAULT NULL,
  p_improvement_summary TEXT DEFAULT NULL,
  p_target_table VARCHAR(100) DEFAULT NULL,
  p_actor_id TEXT DEFAULT 'system',
  p_actor_type VARCHAR(20) DEFAULT 'system',
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO protocol_improvement_audit_log (
    action,
    improvement_id,
    improvement_summary,
    target_table,
    actor_id,
    actor_type,
    details
  ) VALUES (
    p_action,
    p_improvement_id,
    p_improvement_summary,
    p_target_table,
    p_actor_id,
    p_actor_type,
    p_details
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION log_protocol_improvement_action FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_protocol_improvement_action TO service_role;

-- ============================================================================
-- SECTION 5: Trigger for Automatic Audit Logging
-- ============================================================================

-- Trigger function to automatically log status changes
CREATE OR REPLACE FUNCTION trigger_protocol_improvement_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_protocol_improvement_action(
      CASE NEW.status
        WHEN 'APPROVED' THEN 'APPROVED'
        WHEN 'REJECTED' THEN 'REJECTED'
        WHEN 'APPLIED' THEN 'APPLIED'
        WHEN 'EXPIRED' THEN 'EXPIRED'
        ELSE 'CREATED'
      END,
      NEW.id,
      NEW.summary,
      NEW.target_table,
      COALESCE(NEW.approved_by, NEW.created_by, 'system'),
      CASE
        WHEN NEW.approved_by IS NOT NULL THEN 'user'
        ELSE 'system'
      END,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'updated_at', NOW()
      )
    );
  END IF;

  -- Log new improvements
  IF TG_OP = 'INSERT' THEN
    PERFORM log_protocol_improvement_action(
      'CREATED',
      NEW.id,
      NEW.summary,
      NEW.target_table,
      COALESCE(NEW.created_by, 'system'),
      'system',
      jsonb_build_object(
        'source_sd', NEW.source_sd_id,
        'improvement_type', NEW.improvement_type,
        'created_at', NOW()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on protocol_improvement_queue
DROP TRIGGER IF EXISTS trg_protocol_improvement_audit ON protocol_improvement_queue;

CREATE TRIGGER trg_protocol_improvement_audit
AFTER INSERT OR UPDATE ON protocol_improvement_queue
FOR EACH ROW
EXECUTE FUNCTION trigger_protocol_improvement_audit();

-- ============================================================================
-- SECTION 6: Helper Views
-- ============================================================================

-- View for recent audit activity
CREATE OR REPLACE VIEW v_recent_improvement_audit AS
SELECT
  al.id,
  al.action,
  al.improvement_summary,
  al.target_table,
  al.actor_id,
  al.actor_type,
  al.timestamp,
  al.details,
  piq.status AS current_status
FROM protocol_improvement_audit_log al
LEFT JOIN protocol_improvement_queue piq ON al.improvement_id = piq.id
ORDER BY al.timestamp DESC
LIMIT 100;

-- Grant access to the view
GRANT SELECT ON v_recent_improvement_audit TO authenticated;
GRANT SELECT ON v_recent_improvement_audit TO service_role;

-- ============================================================================
-- SECTION 7: Validation Comments
-- ============================================================================

COMMENT ON TABLE protocol_improvement_audit_log IS
'Audit trail for all protocol improvement actions. Tracks who approved what and when changes were applied.';

COMMENT ON FUNCTION log_protocol_improvement_action IS
'Logs a protocol improvement action to the audit trail. Called automatically by trigger or manually by application code.';

COMMENT ON TRIGGER trg_protocol_improvement_audit ON protocol_improvement_queue IS
'Automatically logs status changes and new improvements to the audit trail.';

-- ============================================================================
-- End of Migration
-- ============================================================================
