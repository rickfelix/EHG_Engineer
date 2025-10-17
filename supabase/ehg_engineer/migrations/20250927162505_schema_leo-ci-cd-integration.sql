-- ==========================================
-- LEO Protocol GitHub CI/CD Integration
-- Database Schema Migration
-- ==========================================

-- Pipeline Status Tracking Table
CREATE TABLE IF NOT EXISTS ci_cd_pipeline_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
    repository_name VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    workflow_id BIGINT NOT NULL,
    run_id BIGINT NOT NULL,
    run_number INTEGER NOT NULL,
    commit_sha VARCHAR(40) NOT NULL,
    commit_message TEXT,
    branch_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('queued', 'in_progress', 'completed', 'cancelled', 'failure', 'success', 'skipped')),
    conclusion VARCHAR(50) CHECK (conclusion IN ('success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    workflow_url TEXT,
    logs_url TEXT,
    failure_reason TEXT,
    job_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- GitHub Webhook Events Audit Table
CREATE TABLE IF NOT EXISTS github_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    delivery_id VARCHAR(255) UNIQUE NOT NULL,
    event_payload JSONB NOT NULL,
    signature_valid BOOLEAN NOT NULL DEFAULT false,
    processed_successfully BOOLEAN NOT NULL DEFAULT false,
    processing_error TEXT,
    sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
    pipeline_status_id UUID REFERENCES ci_cd_pipeline_status(id),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- CI/CD Failure Resolution Tracking
CREATE TABLE IF NOT EXISTS ci_cd_failure_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_status_id UUID NOT NULL REFERENCES ci_cd_pipeline_status(id),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
    failure_category VARCHAR(100) NOT NULL CHECK (failure_category IN ('test_failure', 'lint_error', 'build_failure', 'deployment_failure', 'timeout', 'dependency_issue', 'security_scan', 'other')),
    auto_resolution_attempted BOOLEAN NOT NULL DEFAULT false,
    auto_resolution_successful BOOLEAN,
    resolution_method VARCHAR(100),
    sub_agent_triggered VARCHAR(100),
    sub_agent_execution_id UUID,
    manual_intervention_required BOOLEAN NOT NULL DEFAULT false,
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- LEO Phase CI/CD Validation Gates
CREATE TABLE IF NOT EXISTS leo_phase_ci_cd_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
    phase_name VARCHAR(50) NOT NULL CHECK (phase_name IN ('LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'APPROVAL')),
    gate_type VARCHAR(50) NOT NULL CHECK (gate_type IN ('required', 'optional', 'blocking')),
    pipeline_requirements JSONB NOT NULL DEFAULT '{}',
    validation_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validating', 'passed', 'failed', 'skipped')),
    validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),
    last_validation_at TIMESTAMP WITH TIME ZONE,
    validation_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_ci_cd_pipeline_status_sd_id ON ci_cd_pipeline_status(sd_id);
CREATE INDEX IF NOT EXISTS idx_ci_cd_pipeline_status_status ON ci_cd_pipeline_status(status);
CREATE INDEX IF NOT EXISTS idx_ci_cd_pipeline_status_commit_sha ON ci_cd_pipeline_status(commit_sha);
CREATE INDEX IF NOT EXISTS idx_ci_cd_pipeline_status_created_at ON ci_cd_pipeline_status(created_at);

CREATE INDEX IF NOT EXISTS idx_github_webhook_events_event_type ON github_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_github_webhook_events_sd_id ON github_webhook_events(sd_id);
CREATE INDEX IF NOT EXISTS idx_github_webhook_events_received_at ON github_webhook_events(received_at);

CREATE INDEX IF NOT EXISTS idx_ci_cd_failure_resolutions_sd_id ON ci_cd_failure_resolutions(sd_id);
CREATE INDEX IF NOT EXISTS idx_ci_cd_failure_resolutions_category ON ci_cd_failure_resolutions(failure_category);

CREATE INDEX IF NOT EXISTS idx_leo_phase_ci_cd_gates_sd_id ON leo_phase_ci_cd_gates(sd_id);
CREATE INDEX IF NOT EXISTS idx_leo_phase_ci_cd_gates_phase ON leo_phase_ci_cd_gates(phase_name);

-- Add CI/CD status columns to strategic_directives_v2 table
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS ci_cd_status VARCHAR(50) DEFAULT 'unknown' CHECK (ci_cd_status IN ('unknown', 'pending', 'running', 'success', 'failure', 'mixed'));

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS last_pipeline_run TIMESTAMP WITH TIME ZONE;

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS pipeline_health_score INTEGER CHECK (pipeline_health_score >= 0 AND pipeline_health_score <= 100);

-- Update triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_ci_cd_pipeline_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ci_cd_pipeline_status_timestamp
    BEFORE UPDATE ON ci_cd_pipeline_status
    FOR EACH ROW
    EXECUTE FUNCTION update_ci_cd_pipeline_status_timestamp();

CREATE TRIGGER trigger_update_leo_phase_ci_cd_gates_timestamp
    BEFORE UPDATE ON leo_phase_ci_cd_gates
    FOR EACH ROW
    EXECUTE FUNCTION update_ci_cd_pipeline_status_timestamp();

-- Function to get current CI/CD status for an SD
CREATE OR REPLACE FUNCTION get_sd_ci_cd_status(sd_id_param VARCHAR(50))
RETURNS TABLE(
    status VARCHAR(50),
    last_run TIMESTAMP WITH TIME ZONE,
    health_score INTEGER,
    active_failures INTEGER,
    total_pipelines INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN COUNT(*) = 0 THEN 'unknown'::VARCHAR(50)
            WHEN COUNT(*) FILTER (WHERE status = 'failure') > 0 THEN 'failure'::VARCHAR(50)
            WHEN COUNT(*) FILTER (WHERE status = 'in_progress') > 0 THEN 'running'::VARCHAR(50)
            WHEN COUNT(*) FILTER (WHERE status = 'success') = COUNT(*) THEN 'success'::VARCHAR(50)
            ELSE 'mixed'::VARCHAR(50)
        END as status,
        MAX(completed_at) as last_run,
        CASE
            WHEN COUNT(*) = 0 THEN NULL::INTEGER
            ELSE ROUND(
                (COUNT(*) FILTER (WHERE status = 'success')::FLOAT / COUNT(*)::FLOAT) * 100
            )::INTEGER
        END as health_score,
        COUNT(*) FILTER (WHERE status = 'failure')::INTEGER as active_failures,
        COUNT(*)::INTEGER as total_pipelines
    FROM ci_cd_pipeline_status
    WHERE sd_id = sd_id_param
    AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to update SD CI/CD status automatically
CREATE OR REPLACE FUNCTION update_sd_ci_cd_status()
RETURNS TRIGGER AS $$
DECLARE
    sd_status RECORD;
BEGIN
    -- Get current CI/CD status for the SD
    SELECT * INTO sd_status FROM get_sd_ci_cd_status(NEW.sd_id);

    -- Update the strategic directive
    UPDATE strategic_directives_v2
    SET
        ci_cd_status = sd_status.status,
        last_pipeline_run = sd_status.last_run,
        pipeline_health_score = sd_status.health_score,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update SD CI/CD status when pipeline status changes
CREATE TRIGGER trigger_update_sd_ci_cd_status
    AFTER INSERT OR UPDATE ON ci_cd_pipeline_status
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_ci_cd_status();

-- Add validation rules for CI/CD integration to leo_validation_rules
INSERT INTO leo_validation_rules (rule_name, rule_type, severity, description, validation_logic)
VALUES
('ci_cd_pipeline_success', 'exec_gate', 'critical', 'All CI/CD pipelines must pass before EXEC phase completion',
 '{"check": "pipeline_status", "required_status": "success", "min_health_score": 90}'),
('ci_cd_no_active_failures', 'exec_gate', 'high', 'No active CI/CD failures allowed during EXEC phase',
 '{"check": "active_failures", "max_failures": 0}'),
('ci_cd_recent_run', 'exec_gate', 'medium', 'CI/CD pipeline must have run within last 24 hours',
 '{"check": "last_run", "max_age_hours": 24}')
ON CONFLICT (rule_name) DO UPDATE SET
    rule_type = EXCLUDED.rule_type,
    severity = EXCLUDED.severity,
    description = EXCLUDED.description,
    validation_logic = EXCLUDED.validation_logic;

-- Add CI/CD capabilities to DevOps Platform Architect sub-agent
UPDATE leo_sub_agents
SET
    capabilities = COALESCE(capabilities, '[]'::jsonb) || '["ci_cd_failure_analysis", "auto_pipeline_retry", "failure_categorization", "resolution_automation"]'::jsonb,
    description = description || ' Enhanced with CI/CD failure detection and automated resolution capabilities.',
    context_prompt = context_prompt || '\n\nCI/CD Integration: Monitor pipeline status, analyze failures, and implement automated resolution strategies. Categorize failures and trigger appropriate remediation workflows.'
WHERE code = 'GITHUB'
AND NOT (capabilities @> '["ci_cd_failure_analysis"]'::jsonb);

-- Create CI/CD monitoring configuration
CREATE TABLE IF NOT EXISTS ci_cd_monitoring_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_name VARCHAR(255) NOT NULL UNIQUE,
    webhook_secret_hash VARCHAR(255) NOT NULL,
    monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_retry_enabled BOOLEAN NOT NULL DEFAULT true,
    max_auto_retries INTEGER NOT NULL DEFAULT 3,
    failure_notification_channels JSONB DEFAULT '["slack", "email"]'::jsonb,
    escalation_threshold_minutes INTEGER NOT NULL DEFAULT 30,
    health_check_interval_minutes INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration for EHG repositories
INSERT INTO ci_cd_monitoring_config (repository_name, webhook_secret_hash, monitoring_enabled)
VALUES
('rickfelix/ehg', encode(sha256('default_webhook_secret'::bytea), 'hex'), true),
('rickfelix/EHG_Engineer', encode(sha256('default_webhook_secret'::bytea), 'hex'), true)
ON CONFLICT (repository_name) DO NOTHING;

COMMENT ON TABLE ci_cd_pipeline_status IS 'Tracks GitHub CI/CD pipeline status for Strategic Directives';
COMMENT ON TABLE github_webhook_events IS 'Audit log of all GitHub webhook events received';
COMMENT ON TABLE ci_cd_failure_resolutions IS 'Tracks automated and manual resolution of CI/CD failures';
COMMENT ON TABLE leo_phase_ci_cd_gates IS 'CI/CD validation gates for LEO Protocol phases';
COMMENT ON TABLE ci_cd_monitoring_config IS 'Configuration for CI/CD monitoring and automation';