-- Complete Sub-Agent Integration Schema
-- Combines tracking tables with Session Manager registration

-- ============================================================================
-- PART 1: TRACKING TABLES
-- ============================================================================

-- Table for tracking all sub-agent activations
CREATE TABLE IF NOT EXISTS sub_agent_activations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sub_agent_code VARCHAR(50) NOT NULL,
    trigger VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- started, completed, failed, error
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    session_id VARCHAR(100),
    sd_id VARCHAR(50),
    result JSONB,
    metadata JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_code ON sub_agent_activations(sub_agent_code);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_trigger ON sub_agent_activations(trigger);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_status ON sub_agent_activations(status);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_sd ON sub_agent_activations(sd_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_created ON sub_agent_activations(created_at);

-- Table for LEO session tracking
CREATE TABLE IF NOT EXISTS leo_session_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    sd_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),
    created_by VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active', -- active, expired, terminated
    metadata JSONB,
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'terminated'))
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_leo_sessions_sd ON leo_session_tracking(sd_id);
CREATE INDEX IF NOT EXISTS idx_leo_sessions_status ON leo_session_tracking(status);
CREATE INDEX IF NOT EXISTS idx_leo_sessions_expires ON leo_session_tracking(expires_at);

-- Enhanced leo_hook_feedback table with sub-agent tracking
CREATE TABLE IF NOT EXISTS leo_hook_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    resolution_status VARCHAR(50) DEFAULT 'pending',
    resolved_at TIMESTAMP WITH TIME ZONE,
    sub_agent_activated VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE leo_hook_feedback
ADD COLUMN IF NOT EXISTS resolution_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS resolution_details JSONB,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Table for circuit breaker state
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL DEFAULT 'closed', -- closed, open, half_open
    failure_count INTEGER DEFAULT 0,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_state CHECK (state IN ('closed', 'open', 'half_open'))
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_service ON circuit_breaker_state(service_name);

-- ============================================================================
-- PART 2: SESSION MANAGER SUB-AGENT REGISTRATION
-- ============================================================================

-- Register Session Manager as official sub-agent
INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, capabilities, script_path, context_file, active)
VALUES (
    'session-manager',
    'Session Manager',
    'SESSION_MGR',
    'Manages LEO Protocol orchestrator sessions for git operations. Handles session creation, validation, refresh, and cleanup. Integrates with pre-commit hooks and feedback loop.',
    'on_demand',
    50,
    '["session_creation", "session_validation", "session_refresh", "session_cleanup", "auto_resolution"]'::jsonb,
    'scripts/session-manager-subagent.js',
    null,
    true
) ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    script_path = EXCLUDED.script_path,
    active = EXCLUDED.active;

-- Register Database Migration sub-agent
INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, capabilities, script_path, context_file, active)
VALUES (
    'db-migration',
    'Database Migration',
    'DB_MIGRATION',
    'Handles migration of PRD and handoff files from filesystem to database. Ensures LEO Protocol v4.1.2 database-first compliance.',
    'on_demand',
    60,
    '["prd_migration", "handoff_migration", "file_cleanup", "validation"]'::jsonb,
    null,
    null,
    true
) ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    active = EXCLUDED.active;

-- Register Git Operations sub-agent
INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, capabilities, script_path, context_file, active)
VALUES (
    'git-operations',
    'Git Operations',
    'GIT_OPS',
    'Handles git-related operations including stashing, conflict resolution, and repository state management.',
    'on_demand',
    40,
    '["stash_management", "conflict_resolution", "branch_operations", "commit_operations"]'::jsonb,
    null,
    null,
    true
) ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    active = EXCLUDED.active;

-- ============================================================================
-- PART 3: SUB-AGENT TRIGGERS
-- ============================================================================

-- Session Manager triggers
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_context, active)
VALUES
    ('session-manager', 'no_orchestrator_session', 'hook_failure', true),
    ('session-manager', 'stale_session', 'hook_failure', true),
    ('session-manager', 'session_expired', 'hook_failure', true),
    ('session-manager', 'SESSION_CREATE', 'command', true),
    ('session-manager', 'SESSION_VALIDATE', 'command', true)
ON CONFLICT DO NOTHING;

-- Database Migration triggers
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_context, active)
VALUES
    ('db-migration', 'prd_files_detected', 'hook_failure', true),
    ('db-migration', 'handoff_files_detected', 'hook_failure', true),
    ('db-migration', 'filesystem_drift', 'validation', true)
ON CONFLICT DO NOTHING;

-- Git Operations triggers
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_context, active)
VALUES
    ('git-operations', 'uncommitted_changes', 'hook_failure', true),
    ('git-operations', 'merge_conflict', 'hook_failure', true),
    ('git-operations', 'branch_behind', 'validation', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 4: VIEWS AND FUNCTIONS
-- ============================================================================

-- View for sub-agent activation statistics
CREATE OR REPLACE VIEW sub_agent_activation_stats AS
SELECT
    sub_agent_code,
    COUNT(*) as total_activations,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
    COUNT(CASE WHEN status = 'error' THEN 1 END) as errors,
    AVG(EXTRACT(EPOCH FROM (completed_at - activated_at))) as avg_duration_seconds,
    MAX(activated_at) as last_activation,
    SUM(retry_count) as total_retries
FROM sub_agent_activations
GROUP BY sub_agent_code;

-- View for hook feedback resolution stats
CREATE OR REPLACE VIEW hook_resolution_stats AS
SELECT
    error_type,
    COUNT(*) as total_occurrences,
    COUNT(CASE WHEN resolution_status = 'resolved' THEN 1 END) as resolved,
    COUNT(CASE WHEN resolution_method = 'sub-agent' THEN 1 END) as resolved_by_subagent,
    COUNT(CASE WHEN resolution_method = 'legacy' THEN 1 END) as resolved_by_legacy,
    AVG(retry_count) as avg_retries,
    AVG(CASE
        WHEN resolution_status = 'resolved' AND resolved_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (resolved_at - created_at))
    END) as avg_resolution_time_seconds
FROM leo_hook_feedback
GROUP BY error_type;

-- Function to expire old sessions
CREATE OR REPLACE FUNCTION expire_old_sessions()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE leo_session_tracking
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
    AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old activation logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_activations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sub_agent_activations
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to reset circuit breaker
CREATE OR REPLACE FUNCTION reset_circuit_breaker(p_service_name VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE circuit_breaker_state
    SET state = 'closed',
        failure_count = 0,
        last_failure_at = NULL,
        next_retry_at = NULL,
        updated_at = NOW()
    WHERE service_name = p_service_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: PERMISSIONS
-- ============================================================================

-- Grant necessary permissions
GRANT ALL ON sub_agent_activations TO authenticated;
GRANT ALL ON leo_session_tracking TO authenticated;
GRANT ALL ON leo_hook_feedback TO authenticated;
GRANT ALL ON circuit_breaker_state TO authenticated;
GRANT SELECT ON sub_agent_activation_stats TO authenticated;
GRANT SELECT ON hook_resolution_stats TO authenticated;

-- ============================================================================
-- PART 6: SCHEDULED JOBS (Comments for manual setup in Supabase)
-- ============================================================================

-- To set up scheduled jobs in Supabase Dashboard:
-- 1. Go to Database > Extensions and enable pg_cron
-- 2. Go to SQL Editor and run:

-- Schedule session expiration (every 5 minutes)
-- SELECT cron.schedule('expire-sessions', '*/5 * * * *', 'SELECT expire_old_sessions();');

-- Schedule activation log cleanup (daily at 2 AM)
-- SELECT cron.schedule('cleanup-activations', '0 2 * * *', 'SELECT cleanup_old_activations();');

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Run this to verify everything is set up correctly:
SELECT
    'Tables' as check_type,
    COUNT(*) as count
FROM information_schema.tables
WHERE table_name IN ('sub_agent_activations', 'leo_session_tracking', 'circuit_breaker_state')
UNION ALL
SELECT
    'Session Manager Registered' as check_type,
    COUNT(*) as count
FROM leo_sub_agents
WHERE code = 'SESSION_MGR'
UNION ALL
SELECT
    'Triggers Configured' as check_type,
    COUNT(*) as count
FROM leo_sub_agent_triggers
WHERE sub_agent_id IN ('session-manager', 'db-migration', 'git-operations');