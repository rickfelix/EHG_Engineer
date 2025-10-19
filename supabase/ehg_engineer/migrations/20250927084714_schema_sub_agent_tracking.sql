-- Sub-Agent Activation Tracking Tables
-- For LEO Protocol hook feedback system integration

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_code ON sub_agent_activations(sub_agent_code);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_trigger ON sub_agent_activations(trigger);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_status ON sub_agent_activations(status);
CREATE INDEX IF NOT EXISTS idx_sub_agent_activations_sd ON sub_agent_activations(sd_id);

-- Table for LEO session tracking
CREATE TABLE IF NOT EXISTS leo_session_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    sd_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active', -- active, expired, terminated
    metadata JSONB,
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'terminated'))
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_leo_sessions_sd ON leo_session_tracking(sd_id);
CREATE INDEX IF NOT EXISTS idx_leo_sessions_status ON leo_session_tracking(status);

-- Enhanced leo_hook_feedback table with sub-agent tracking
ALTER TABLE leo_hook_feedback
ADD COLUMN IF NOT EXISTS resolution_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS resolution_details JSONB;

-- View for sub-agent activation statistics
CREATE OR REPLACE VIEW sub_agent_activation_stats AS
SELECT
    sub_agent_code,
    COUNT(*) as total_activations,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
    COUNT(CASE WHEN status = 'error' THEN 1 END) as errors,
    AVG(EXTRACT(EPOCH FROM (completed_at - activated_at))) as avg_duration_seconds,
    MAX(activated_at) as last_activation
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
    AVG(CASE
        WHEN resolution_status = 'resolved' AND resolved_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (resolved_at - created_at))
    END) as avg_resolution_time_seconds
FROM leo_hook_feedback
GROUP BY error_type;

-- Function to expire old sessions
CREATE OR REPLACE FUNCTION expire_old_sessions()
RETURNS void AS $$
BEGIN
    UPDATE leo_session_tracking
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
    AND created_at < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON sub_agent_activations TO authenticated;
GRANT ALL ON leo_session_tracking TO authenticated;
GRANT SELECT ON sub_agent_activation_stats TO authenticated;
GRANT SELECT ON hook_resolution_stats TO authenticated;