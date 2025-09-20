-- Product Requirements Documents (PRDs) Schema
-- LEO Protocol v4.1 Implementation
-- Database-first approach for PRDs

-- Product Requirements Documents table
CREATE TABLE IF NOT EXISTS product_requirements_v2 (
    id VARCHAR(100) PRIMARY KEY,
    directive_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'planning', 'in_progress', 'testing', 'approved', 'completed', 'archived')),
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    
    -- Executive Summary
    executive_summary TEXT,
    business_context TEXT,
    technical_context TEXT,
    
    -- Requirements
    functional_requirements JSONB DEFAULT '[]'::jsonb,
    non_functional_requirements JSONB DEFAULT '[]'::jsonb,
    technical_requirements JSONB DEFAULT '[]'::jsonb,
    
    -- Design & Architecture
    system_architecture TEXT,
    data_model JSONB DEFAULT '{}'::jsonb,
    api_specifications JSONB DEFAULT '[]'::jsonb,
    ui_ux_requirements JSONB DEFAULT '[]'::jsonb,
    
    -- Implementation Details
    implementation_approach TEXT,
    technology_stack JSONB DEFAULT '[]'::jsonb,
    dependencies JSONB DEFAULT '[]'::jsonb,
    
    -- Testing & Validation
    test_scenarios JSONB DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    performance_requirements JSONB DEFAULT '{}'::jsonb,
    
    -- Checklists
    plan_checklist JSONB DEFAULT '[]'::jsonb,
    exec_checklist JSONB DEFAULT '[]'::jsonb,
    validation_checklist JSONB DEFAULT '[]'::jsonb,
    
    -- Progress Tracking
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    phase VARCHAR(50) CHECK (phase IN ('planning', 'design', 'implementation', 'verification', 'approval')),
    phase_progress JSONB DEFAULT '{}'::jsonb,
    
    -- Risks & Constraints
    risks JSONB DEFAULT '[]'::jsonb,
    constraints JSONB DEFAULT '[]'::jsonb,
    assumptions JSONB DEFAULT '[]'::jsonb,
    
    -- Stakeholders & Approvals
    stakeholders JSONB DEFAULT '[]'::jsonb,
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    
    -- Timeline
    planned_start TIMESTAMP,
    planned_end TIMESTAMP,
    actual_start TIMESTAMP,
    actual_end TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Document content (markdown)
    content TEXT,
    
    CONSTRAINT unique_prd_per_directive UNIQUE(directive_id)
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_prd_status ON product_requirements_v2(status);
CREATE INDEX IF NOT EXISTS idx_prd_directive ON product_requirements_v2(directive_id);
CREATE INDEX IF NOT EXISTS idx_prd_priority ON product_requirements_v2(priority);
CREATE INDEX IF NOT EXISTS idx_prd_created_at ON product_requirements_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prd_phase ON product_requirements_v2(phase);

-- Update trigger for updated_at column
CREATE TRIGGER update_product_requirements_v2_updated_at BEFORE UPDATE ON product_requirements_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for PRD with SD information
CREATE OR REPLACE VIEW prd_with_sd_view AS
SELECT 
    p.*,
    s.title as sd_title,
    s.status as sd_status,
    s.priority as sd_priority,
    s.category as sd_category
FROM product_requirements_v2 p
LEFT JOIN strategic_directives_v2 s ON p.directive_id = s.id;