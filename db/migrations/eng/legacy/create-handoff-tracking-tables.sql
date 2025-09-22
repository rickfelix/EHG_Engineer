-- Create Missing Handoff Tracking Tables
-- Extends existing leo_handoff_templates with execution tracking
-- LEO Protocol v4.1.2 Database-First Compliance

-- 1. Handoff Executions Table - Track actual handoff instances
CREATE TABLE IF NOT EXISTS leo_handoff_executions (
    id TEXT PRIMARY KEY,
    template_id INTEGER REFERENCES leo_handoff_templates(id),
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    sd_id TEXT NOT NULL,
    prd_id TEXT,
    handoff_type TEXT NOT NULL,
    
    -- Execution Details
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'accepted', 'rejected', 'failed')),
    
    -- Handoff Content (7 required elements)
    executive_summary TEXT,
    completeness_report JSONB,
    deliverables_manifest JSONB,
    key_decisions JSONB,
    known_issues JSONB,
    resource_utilization JSONB,
    action_items JSONB,
    
    -- Validation Results
    validation_score INTEGER DEFAULT 0,
    validation_passed BOOLEAN DEFAULT FALSE,
    validation_details JSONB,
    
    -- Metadata
    created_by TEXT,
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT valid_agent_transition UNIQUE(sd_id, from_agent, to_agent, initiated_at)
);

-- 2. Handoff Validations Table - Detailed validation results
CREATE TABLE IF NOT EXISTS leo_handoff_validations (
    id TEXT PRIMARY KEY,
    execution_id TEXT REFERENCES leo_handoff_executions(id),
    validator_type TEXT NOT NULL, -- 'template', 'prd_quality', 'sub_agent', 'checklist'
    
    -- Validation Results
    passed BOOLEAN NOT NULL,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 100,
    percentage INTEGER GENERATED ALWAYS AS (
        CASE WHEN max_score > 0 THEN (score * 100 / max_score) ELSE 0 END
    ) STORED,
    
    -- Detailed Results
    validation_details JSONB NOT NULL DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    blocking_issues JSONB DEFAULT '[]',
    
    -- Metadata
    validated_at TIMESTAMPTZ DEFAULT NOW(),
    validator_version TEXT,
    metadata JSONB DEFAULT '{}'
);

-- 3. Handoff Rejections Table - Track failed handoffs with improvement guidance
CREATE TABLE IF NOT EXISTS leo_handoff_rejections (
    id TEXT PRIMARY KEY,
    execution_id TEXT REFERENCES leo_handoff_executions(id),
    
    -- Rejection Details
    rejected_at TIMESTAMPTZ DEFAULT NOW(),
    rejected_by TEXT, -- 'system' or agent name
    rejection_reason TEXT NOT NULL,
    
    -- Improvement Guidance
    required_improvements JSONB NOT NULL DEFAULT '[]',
    blocking_validations JSONB DEFAULT '[]',
    recommended_actions JSONB DEFAULT '[]',
    
    -- Return Instructions
    return_to_agent TEXT NOT NULL,
    retry_instructions TEXT,
    estimated_fix_time TEXT,
    
    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_handoff_executions_sd_id ON leo_handoff_executions(sd_id);
CREATE INDEX IF NOT EXISTS idx_handoff_executions_status ON leo_handoff_executions(status);
CREATE INDEX IF NOT EXISTS idx_handoff_executions_agents ON leo_handoff_executions(from_agent, to_agent);
CREATE INDEX IF NOT EXISTS idx_handoff_validations_execution ON leo_handoff_validations(execution_id);
CREATE INDEX IF NOT EXISTS idx_handoff_rejections_execution ON leo_handoff_rejections(execution_id);

-- Comments for Documentation
COMMENT ON TABLE leo_handoff_executions IS 'Track actual handoff instances with validation results';
COMMENT ON TABLE leo_handoff_validations IS 'Detailed validation results for handoff quality assurance';
COMMENT ON TABLE leo_handoff_rejections IS 'Failed handoffs with improvement guidance and retry tracking';