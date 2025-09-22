-- PLAN Supervisor Enhancement - Safe Application
-- This adds supervisor capabilities WITHOUT disrupting existing LEO Protocol
-- Date: 2025-01-04

-- Note: supervisor_mode columns are OPTIONAL and don't affect existing PLAN operations
-- These are additive features only

-- ============================================================================
-- VERIFICATION RESULTS TRACKING (New table - no conflicts)
-- ============================================================================

-- Store verification session results (completely new table)
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
    metadata JSONB DEFAULT '{}'
);

-- Track individual sub-agent queries (new table)
CREATE TABLE IF NOT EXISTS plan_subagent_queries (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
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

-- Conflict resolution rules (new table)
CREATE TABLE IF NOT EXISTS plan_conflict_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL UNIQUE,
    priority INTEGER NOT NULL,
    
    -- Condition
    if_condition JSONB NOT NULL,
    
    -- Action
    then_action VARCHAR(50) NOT NULL,
    override_agents JSONB DEFAULT '[]',
    
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
     'Allow conditional pass if only warnings exist')
ON CONFLICT (rule_name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_session ON plan_verification_results(session_id);
CREATE INDEX IF NOT EXISTS idx_verification_prd ON plan_verification_results(prd_id);
CREATE INDEX IF NOT EXISTS idx_verification_status ON plan_verification_results(status);
CREATE INDEX IF NOT EXISTS idx_subagent_session ON plan_subagent_queries(session_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON plan_verification_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON plan_subagent_queries TO authenticated;
GRANT SELECT ON plan_conflict_rules TO authenticated;

-- Note: We're NOT modifying the leo_agents table to avoid any disruption
-- The supervisor features work independently