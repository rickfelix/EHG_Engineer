-- Sub-Agent Execution Results Table
-- Stores comprehensive results from Enhanced QA Engineering Director v2.0
-- Created: 2025-10-04
-- Part of: Enhanced QA Sub-Agent Implementation

CREATE TABLE IF NOT EXISTS sub_agent_execution_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Sub-agent identification
    sub_agent_id VARCHAR(50) NOT NULL,
    sub_agent_code VARCHAR(20),
    version VARCHAR(20) DEFAULT '2.0.0',

    -- Strategic Directive linkage
    sd_id VARCHAR(50) NOT NULL,

    -- Overall verdict
    verdict VARCHAR(20) NOT NULL CHECK (verdict IN ('PASS', 'FAIL', 'BLOCKED', 'CONDITIONAL_PASS', 'WARNING', 'ERROR')),
    confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),

    -- Phase results (JSONB for flexibility)
    pre_flight_checks JSONB DEFAULT '{}',
    test_planning JSONB DEFAULT '{}',
    test_execution JSONB DEFAULT '{}',
    evidence JSONB DEFAULT '{}',

    -- Summary and recommendations
    summary JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',

    -- Time tracking
    time_saved VARCHAR(50),
    execution_duration_seconds INTEGER,

    -- Metadata
    target_app VARCHAR(50),
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_sd_id ON sub_agent_execution_results(sd_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_sub_agent ON sub_agent_execution_results(sub_agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_verdict ON sub_agent_execution_results(verdict);
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_created ON sub_agent_execution_results(created_at DESC);

-- GIN index for JSONB searching
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_pre_flight ON sub_agent_execution_results USING GIN (pre_flight_checks);
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_recommendations ON sub_agent_execution_results USING GIN (recommendations);

-- Add comment for documentation
COMMENT ON TABLE sub_agent_execution_results IS 'Stores comprehensive execution results from Enhanced QA Engineering Director v2.0 and other sub-agents';
COMMENT ON COLUMN sub_agent_execution_results.pre_flight_checks IS 'Results from Phase 1: build, migrations, dependencies, integration checks';
COMMENT ON COLUMN sub_agent_execution_results.test_planning IS 'Results from Phase 2: tier selection, infrastructure discovery';
COMMENT ON COLUMN sub_agent_execution_results.test_execution IS 'Results from Phase 3: smoke tests, E2E tests, manual testing';
COMMENT ON COLUMN sub_agent_execution_results.evidence IS 'Results from Phase 4: screenshots, logs, coverage reports';
COMMENT ON COLUMN sub_agent_execution_results.time_saved IS 'Estimated time saved by automated checks (e.g., "3-4 hours")';
