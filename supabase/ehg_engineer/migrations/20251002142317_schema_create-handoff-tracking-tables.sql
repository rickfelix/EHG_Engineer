-- Create Missing Handoff Tracking Tables
-- Leo Protocol v4.2.0 Database-First Enforcement

-- 1. Handoff Validations Table
CREATE TABLE IF NOT EXISTS leo_handoff_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES leo_handoff_executions(id),
    validator_type TEXT NOT NULL CHECK (validator_type IN ('template', 'prd_quality', 'sub_agent', 'checklist')),

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

-- 2. Handoff Rejections Table
CREATE TABLE IF NOT EXISTS leo_handoff_rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES leo_handoff_executions(id),

    -- Rejection Details
    rejected_at TIMESTAMPTZ DEFAULT NOW(),
    rejected_by TEXT,
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

-- 3. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_handoff_validations_execution ON leo_handoff_validations(execution_id);
CREATE INDEX IF NOT EXISTS idx_handoff_validations_type ON leo_handoff_validations(validator_type);
CREATE INDEX IF NOT EXISTS idx_handoff_validations_passed ON leo_handoff_validations(passed);

CREATE INDEX IF NOT EXISTS idx_handoff_rejections_execution ON leo_handoff_rejections(execution_id);
CREATE INDEX IF NOT EXISTS idx_handoff_rejections_resolved ON leo_handoff_rejections(resolved_at);
CREATE INDEX IF NOT EXISTS idx_handoff_rejections_agent ON leo_handoff_rejections(return_to_agent);

-- 4. Add Comments for Documentation
COMMENT ON TABLE leo_handoff_validations IS 'Stores validation results for handoff executions in LEO Protocol v4.2.0';
COMMENT ON TABLE leo_handoff_rejections IS 'Tracks rejected handoffs with improvement guidance for LEO Protocol v4.2.0';
COMMENT ON COLUMN leo_handoff_validations.validator_type IS 'Type of validation: template, prd_quality, sub_agent, or checklist';
COMMENT ON COLUMN leo_handoff_rejections.rejection_reason IS 'Human-readable explanation of why handoff was rejected';
