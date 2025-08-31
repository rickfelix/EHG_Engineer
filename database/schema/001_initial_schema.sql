-- EHG_Engineer Database Schema
-- LEO Protocol v3.1.5 Implementation

-- Strategic Directives v2
CREATE TABLE IF NOT EXISTS strategic_directives_v2 (
    id VARCHAR(50) PRIMARY KEY,
    legacy_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    description TEXT NOT NULL,
    strategic_intent TEXT,
    rationale TEXT NOT NULL,
    scope TEXT NOT NULL,
    key_changes JSONB DEFAULT '[]'::jsonb,
    strategic_objectives JSONB DEFAULT '[]'::jsonb,
    success_criteria JSONB DEFAULT '[]'::jsonb,
    key_principles JSONB DEFAULT '[]'::jsonb,
    implementation_guidelines JSONB DEFAULT '[]'::jsonb,
    dependencies JSONB DEFAULT '[]'::jsonb,
    risks JSONB DEFAULT '[]'::jsonb,
    success_metrics JSONB DEFAULT '[]'::jsonb,
    stakeholders JSONB DEFAULT '[]'::jsonb,
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    effective_date TIMESTAMP,
    expiry_date TIMESTAMP,
    review_schedule VARCHAR(100),
    execution_order INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Execution Sequences v2
CREATE TABLE IF NOT EXISTS execution_sequences_v2 (
    id VARCHAR(50) PRIMARY KEY,
    directive_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    sequence_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('planned', 'in_progress', 'completed', 'blocked', 'cancelled')),
    phase VARCHAR(100),
    phase_description TEXT,
    planned_start TIMESTAMP,
    planned_end TIMESTAMP,
    actual_start TIMESTAMP,
    actual_end TIMESTAMP,
    timeline_notes TEXT,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    deliverables JSONB,
    deliverable_details TEXT,
    assigned_to JSONB DEFAULT '[]'::jsonb,
    resource_notes TEXT,
    dependencies JSONB DEFAULT '[]'::jsonb,
    dependency_rationale TEXT,
    blockers JSONB DEFAULT '[]'::jsonb,
    blocker_context TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(directive_id, sequence_number)
);

-- HAP Blocks v2
CREATE TABLE IF NOT EXISTS hap_blocks_v2 (
    hap_id VARCHAR(50) PRIMARY KEY,
    strategic_directive_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
    execution_sequence_id VARCHAR(50) REFERENCES execution_sequences_v2(id),
    title VARCHAR(500) NOT NULL,
    objective TEXT NOT NULL,
    detailed_description TEXT,
    status VARCHAR(50) NOT NULL,
    timeline VARCHAR(100),
    timeline_rationale TEXT,
    tasks JSONB DEFAULT '[]'::jsonb,
    task_narrative TEXT,
    completion_date TIMESTAMP,
    completion_notes TEXT,
    subtask_count INTEGER DEFAULT 0,
    estimated_duration_minutes INTEGER,
    implementation_notes TEXT,
    technical_considerations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_status ON strategic_directives_v2(status);
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_category ON strategic_directives_v2(category);
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_priority ON strategic_directives_v2(priority);
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_created_at ON strategic_directives_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_execution_order ON strategic_directives_v2(execution_order);

CREATE INDEX IF NOT EXISTS idx_execution_sequences_v2_directive ON execution_sequences_v2(directive_id);
CREATE INDEX IF NOT EXISTS idx_execution_sequences_v2_status ON execution_sequences_v2(status);
CREATE INDEX IF NOT EXISTS idx_execution_sequences_v2_order ON execution_sequences_v2(directive_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_hap_blocks_v2_sequence ON hap_blocks_v2(execution_sequence_id);
CREATE INDEX IF NOT EXISTS idx_hap_blocks_v2_directive ON hap_blocks_v2(strategic_directive_id);
CREATE INDEX IF NOT EXISTS idx_hap_blocks_v2_status ON hap_blocks_v2(status);

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_strategic_directives_v2_updated_at BEFORE UPDATE ON strategic_directives_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_execution_sequences_v2_updated_at BEFORE UPDATE ON execution_sequences_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hap_blocks_v2_updated_at BEFORE UPDATE ON hap_blocks_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();