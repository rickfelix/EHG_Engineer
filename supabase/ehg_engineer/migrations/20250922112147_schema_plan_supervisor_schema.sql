-- PLAN Supervisor Enhancement Schema
-- Adds supervisor verification capabilities to PLAN agent
-- Version: 1.0.0
-- Date: 2025-01-04

-- ============================================================================
-- PLAN SUPERVISOR CONFIGURATION
-- ============================================================================

-- Add supervisor capabilities to existing PLAN agent
ALTER TABLE leo_agents 
ADD COLUMN IF NOT EXISTS supervisor_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS supervisor_config JSONB DEFAULT '{
  "maxIterations": 3,
  "timeoutMs": 120000,
  "confidenceThreshold": 85,
  "conflictResolution": "priority-based",
  "fallbackStrategy": "escalate-to-lead"
}';

-- Update PLAN agent to enable supervisor mode
UPDATE leo_agents 
SET supervisor_mode = true,
    supervisor_config = jsonb_set(
      supervisor_config,
      '{enabled}',
      'true'::jsonb
    )
WHERE agent_code = 'PLAN';

-- ============================================================================
-- VERIFICATION RESULTS TRACKING
-- ============================================================================

-- Store verification session results
CREATE TABLE IF NOT EXISTS plan_verification_results (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL DEFAULT gen_random_uuid(),
    prd_id VARCHAR(100),
    sd_id VARCHAR(100),
    verification_type VARCHAR(50) NOT NULL DEFAULT 'final_supervisor',
    
    -- Verification status
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
    confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
    verdict VARCHAR(20) CHECK (verdict IN ('pass', 'fail', 'conditional_pass', 'escalate')),
    
    -- Sub-agent results
    sub_agent_results JSONB DEFAULT '{}',
    
    -- Requirements tracking
    requirements_met JSONB DEFAULT '[]',
    requirements_unmet JSONB DEFAULT '[]',
    requirements_total INTEGER,
    
    -- Issues and findings
    critical_issues JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    
    -- Timing
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- Metadata
    iteration_number INTEGER DEFAULT 1,
    triggered_by VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    
    -- Indexes for performance
    CONSTRAINT unique_active_session UNIQUE(prd_id, status) 
      DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_verification_session ON plan_verification_results(session_id);
CREATE INDEX idx_verification_prd ON plan_verification_results(prd_id);
CREATE INDEX idx_verification_status ON plan_verification_results(status);
CREATE INDEX idx_verification_created ON plan_verification_results(started_at DESC);

-- ============================================================================
-- SUB-AGENT VERIFICATION QUERIES
-- ============================================================================

-- Track individual sub-agent query results
CREATE TABLE IF NOT EXISTS plan_subagent_queries (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES plan_verification_results(session_id) ON DELETE CASCADE,
    sub_agent_code VARCHAR(20) NOT NULL,
    query_type VARCHAR(50) NOT NULL DEFAULT 'verification_check',
    
    -- Query details
    request_payload JSONB,
    response_payload JSONB,
    
    -- Status tracking
    status VARCHAR(20) CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout')),
    confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
    
    -- Timing
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    response_time_ms INTEGER,
    timeout_ms INTEGER DEFAULT 5000,
    
    -- Circuit breaker
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    circuit_breaker_status VARCHAR(20) DEFAULT 'closed',
    
    UNIQUE(session_id, sub_agent_code)
);

CREATE INDEX idx_subagent_session ON plan_subagent_queries(session_id);
CREATE INDEX idx_subagent_status ON plan_subagent_queries(status);

-- ============================================================================
-- CONFLICT RESOLUTION RULES
-- ============================================================================

-- Define how to resolve conflicting sub-agent reports
CREATE TABLE IF NOT EXISTS plan_conflict_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL UNIQUE,
    priority INTEGER NOT NULL,
    
    -- Condition
    if_condition JSONB NOT NULL, -- e.g., {"SECURITY": "CRITICAL", "TESTING": "PASSED"}
    
    -- Action
    then_action VARCHAR(50) NOT NULL, -- e.g., "BLOCK", "WARN", "PASS"
    override_agents JSONB DEFAULT '[]', -- Which agents this rule can override
    
    -- Metadata
    active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default conflict resolution rules
INSERT INTO plan_conflict_rules (rule_name, priority, if_condition, then_action, override_agents, description)
VALUES 
    ('security_critical_override', 1, 
     '{"SECURITY": "CRITICAL"}', 
     'BLOCK', 
     '["*"]',
     'Security critical issues override all other agents'),
    
    ('database_failure_override', 2,
     '{"DATABASE": "FAILED"}',
     'BLOCK',
     '["TESTING", "PERFORMANCE", "DESIGN", "COST", "DOCUMENTATION"]',
     'Database failures block except for security issues'),
    
    ('testing_conditional_pass', 3,
     '{"TESTING": "PASSED", "others": "WARNING"}',
     'CONDITIONAL_PASS',
     '[]',
     'Allow conditional pass if only warnings exist'),
     
    ('consensus_required', 4,
     '{"consensus": ["SECURITY", "DATABASE", "TESTING"]}',
     'REQUIRE_CONSENSUS',
     '[]',
     'Core agents must agree for pass verdict');

-- ============================================================================
-- VERIFICATION TRIGGERS
-- ============================================================================

-- Add PLAN supervisor triggers to existing trigger table
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority, active)
SELECT 
    'PLAN_SUPERVISOR',
    trigger_phrase,
    'keyword',
    'verification',
    95,
    true
FROM (VALUES 
    ('testing complete'),
    ('all tests passing'),
    ('ready for verification'),
    ('exec phase complete'),
    ('implementation complete'),
    ('ready for final check'),
    ('verify requirements met')
) AS triggers(trigger_phrase)
WHERE NOT EXISTS (
    SELECT 1 FROM leo_sub_agent_triggers 
    WHERE sub_agent_id = 'PLAN_SUPERVISOR' 
    AND trigger_phrase = triggers.trigger_phrase
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if verification can proceed
CREATE OR REPLACE FUNCTION can_start_verification(p_prd_id VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if there's already an active verification
    IF EXISTS (
        SELECT 1 FROM plan_verification_results
        WHERE prd_id = p_prd_id
        AND status IN ('pending', 'running')
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Check iteration limit
    IF (SELECT COUNT(*) FROM plan_verification_results WHERE prd_id = p_prd_id) >= 3 THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate final verdict based on sub-agent results
CREATE OR REPLACE FUNCTION calculate_verification_verdict(p_session_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_critical_count INTEGER;
    v_failed_count INTEGER;
    v_warning_count INTEGER;
    v_confidence NUMERIC;
BEGIN
    -- Count critical issues
    SELECT COUNT(*) INTO v_critical_count
    FROM plan_subagent_queries
    WHERE session_id = p_session_id
    AND response_payload->>'severity' = 'CRITICAL';
    
    -- Count failures
    SELECT COUNT(*) INTO v_failed_count
    FROM plan_subagent_queries
    WHERE session_id = p_session_id
    AND status = 'failed';
    
    -- Count warnings
    SELECT COUNT(*) INTO v_warning_count
    FROM plan_subagent_queries
    WHERE session_id = p_session_id
    AND response_payload->>'severity' = 'WARNING';
    
    -- Calculate average confidence
    SELECT AVG(confidence) INTO v_confidence
    FROM plan_subagent_queries
    WHERE session_id = p_session_id
    AND confidence IS NOT NULL;
    
    -- Determine verdict
    IF v_critical_count > 0 THEN
        RETURN 'fail';
    ELSIF v_failed_count > 2 THEN
        RETURN 'escalate';
    ELSIF v_warning_count > 0 AND v_confidence < 85 THEN
        RETURN 'conditional_pass';
    ELSIF v_confidence >= 85 THEN
        RETURN 'pass';
    ELSE
        RETURN 'escalate';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUDIT AND MONITORING
-- ============================================================================

-- Create view for verification dashboard
CREATE OR REPLACE VIEW plan_verification_dashboard AS
SELECT 
    pvr.session_id,
    pvr.prd_id,
    pvr.status,
    pvr.confidence_score,
    pvr.verdict,
    pvr.iteration_number,
    pvr.started_at,
    pvr.completed_at,
    pvr.duration_ms,
    jsonb_array_length(pvr.requirements_met) as requirements_met_count,
    jsonb_array_length(pvr.requirements_unmet) as requirements_unmet_count,
    jsonb_array_length(pvr.critical_issues) as critical_issue_count,
    jsonb_array_length(pvr.warnings) as warning_count,
    (
        SELECT jsonb_object_agg(sub_agent_code, status)
        FROM plan_subagent_queries
        WHERE session_id = pvr.session_id
    ) as sub_agent_statuses
FROM plan_verification_results pvr
ORDER BY pvr.started_at DESC;

-- Grant permissions (adjust based on your user setup)
GRANT SELECT, INSERT, UPDATE ON plan_verification_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON plan_subagent_queries TO authenticated;
GRANT SELECT ON plan_conflict_rules TO authenticated;
GRANT SELECT ON plan_verification_dashboard TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Record migration
INSERT INTO leo_protocol_changes (
    protocol_id,
    change_type,
    description,
    changed_by,
    change_reason
) VALUES (
    'leo-v4-1-2-database-first',
    'enhancement',
    'Added PLAN Supervisor verification capabilities',
    'system',
    'Enhanced PLAN agent with final supervisor verification role to ensure all requirements are truly met'
);