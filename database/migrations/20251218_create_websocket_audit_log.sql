-- Migration: Create websocket_audit_log table
-- SD: SD-HARDENING-V2-001B
-- Purpose: Audit trail for WebSocket authentication and operations
-- Created: 2025-12-18

-- Create websocket_audit_log table
CREATE TABLE IF NOT EXISTS websocket_audit_log (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,

    -- Operation details
    operation_type TEXT NOT NULL,
    payload JSONB,

    -- Result tracking
    success BOOLEAN NOT NULL,
    error_message TEXT,

    -- Security context
    ip_address TEXT,

    -- Audit timestamp
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for common query patterns
CREATE INDEX idx_websocket_audit_created_at
    ON websocket_audit_log(created_at DESC);

CREATE INDEX idx_websocket_audit_user_id
    ON websocket_audit_log(user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX idx_websocket_audit_operation_type
    ON websocket_audit_log(operation_type);

CREATE INDEX idx_websocket_audit_success
    ON websocket_audit_log(success, created_at DESC);

-- Enable Row Level Security
ALTER TABLE websocket_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Chairman can read all audit logs
CREATE POLICY select_websocket_audit_chairman
    ON websocket_audit_log
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'chairman'
        )
    );

-- RLS Policy: Service role can insert audit logs
CREATE POLICY insert_websocket_audit_service
    ON websocket_audit_log
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- RLS Policy: No UPDATE allowed (immutable audit trail)
-- No UPDATE policy = no one can update

-- RLS Policy: No DELETE allowed (immutable audit trail)
-- No DELETE policy = no one can delete

-- Add table comment
COMMENT ON TABLE websocket_audit_log IS 'Immutable audit trail for WebSocket authentication and operations. Part of SD-HARDENING-V2-001B security hardening initiative.';

-- Add column comments
COMMENT ON COLUMN websocket_audit_log.id IS 'Unique identifier for audit entry';
COMMENT ON COLUMN websocket_audit_log.user_id IS 'Foreign key to auth.users. NULL for anonymous/failed auth attempts';
COMMENT ON COLUMN websocket_audit_log.user_email IS 'Email captured from JWT or auth attempt for correlation';
COMMENT ON COLUMN websocket_audit_log.operation_type IS 'Type of WebSocket operation (connection, message, subscription, etc)';
COMMENT ON COLUMN websocket_audit_log.payload IS 'JSONB payload containing operation details and context';
COMMENT ON COLUMN websocket_audit_log.success IS 'TRUE if operation succeeded, FALSE if failed or rejected';
COMMENT ON COLUMN websocket_audit_log.error_message IS 'Error details if operation failed';
COMMENT ON COLUMN websocket_audit_log.ip_address IS 'Client IP address for security tracking';
COMMENT ON COLUMN websocket_audit_log.created_at IS 'Immutable timestamp of audit entry creation';
