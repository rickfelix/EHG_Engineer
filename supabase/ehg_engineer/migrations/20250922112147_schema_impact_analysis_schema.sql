-- Impact Analysis Schema
-- Tables for storing application impact analysis and consistency validation results
-- Supports the comprehensive change management system in Directive Lab

-- Table: submission_impact_analyses
-- Stores comprehensive impact analysis results for each submission
CREATE TABLE IF NOT EXISTS submission_impact_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES directive_submissions(id) ON DELETE CASCADE,
    
    -- Core Impact Metrics
    impact_score INTEGER NOT NULL CHECK (impact_score >= 0 AND impact_score <= 100),
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    rollback_complexity VARCHAR(20) NOT NULL CHECK (rollback_complexity IN ('simple', 'moderate', 'complex')),
    estimated_effort_multiplier DECIMAL(3,1) NOT NULL DEFAULT 1.0,
    
    -- Component Analysis
    affected_components JSONB NOT NULL DEFAULT '[]',
    dependencies JSONB NOT NULL DEFAULT '[]',
    breaking_changes JSONB NOT NULL DEFAULT '[]',
    
    -- Recommendations and Strategies
    recommendations JSONB NOT NULL DEFAULT '[]',
    mitigation_strategies JSONB NOT NULL DEFAULT '[]',
    
    -- Analysis metadata
    analyzer_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    analysis_duration_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes for common queries
    CONSTRAINT unique_submission_analysis UNIQUE(submission_id)
);

-- Table: submission_consistency_validations
-- Stores consistency validation results
CREATE TABLE IF NOT EXISTS submission_consistency_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES directive_submissions(id) ON DELETE CASCADE,
    impact_analysis_id UUID REFERENCES submission_impact_analyses(id) ON DELETE CASCADE,
    
    -- Validation Results
    passed BOOLEAN NOT NULL DEFAULT false,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    overall_risk VARCHAR(20) NOT NULL CHECK (overall_risk IN ('low', 'medium', 'high', 'critical', 'unknown')),
    
    -- Detailed Results
    category_scores JSONB NOT NULL DEFAULT '{}',
    violations JSONB NOT NULL DEFAULT '[]',
    warnings JSONB NOT NULL DEFAULT '[]',
    recommendations JSONB NOT NULL DEFAULT '[]',
    blocking_issues JSONB NOT NULL DEFAULT '[]',
    
    -- Validation metadata
    validator_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    validation_duration_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes for common queries
    CONSTRAINT unique_submission_consistency UNIQUE(submission_id)
);

-- Table: impact_analysis_components
-- Stores detailed information about affected components
CREATE TABLE IF NOT EXISTS impact_analysis_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    impact_analysis_id UUID NOT NULL REFERENCES submission_impact_analyses(id) ON DELETE CASCADE,
    
    -- Component Details
    component_name VARCHAR(100) NOT NULL,
    component_type VARCHAR(50) NOT NULL, -- 'ui', 'api', 'database', etc.
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Dependencies
    dependencies JSONB NOT NULL DEFAULT '[]',
    dependents JSONB NOT NULL DEFAULT '[]',
    
    -- Impact details
    impact_description TEXT,
    estimated_effort_hours INTEGER,
    required_skills JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_component_analysis (impact_analysis_id, component_name),
    INDEX idx_component_risk (component_name, risk_level)
);

-- Table: consistency_validation_rules
-- Configuration table for consistency validation rules
CREATE TABLE IF NOT EXISTS consistency_validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rule Definition
    rule_id VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL, -- 'design_system', 'user_experience', 'technical', 'business_logic'
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    
    -- Rule Configuration
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    patterns JSONB NOT NULL DEFAULT '[]', -- Keywords/patterns that trigger this rule
    active BOOLEAN NOT NULL DEFAULT true,
    
    -- Rule Logic
    validator_function VARCHAR(100), -- Function name in the consistency enforcer
    custom_logic JSONB, -- Additional rule configuration
    
    -- Metadata
    created_by VARCHAR(100),
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_rules_category (category, active),
    INDEX idx_rules_severity (severity, active)
);

-- Table: impact_analysis_history
-- Tracks changes to impact analyses over time (for learning and improvement)
CREATE TABLE IF NOT EXISTS impact_analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES directive_submissions(id),
    
    -- Historical Analysis Data
    analysis_version INTEGER NOT NULL DEFAULT 1,
    impact_score INTEGER NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    affected_components_count INTEGER NOT NULL DEFAULT 0,
    
    -- Actual vs Predicted (for learning)
    actual_effort_hours INTEGER, -- Filled in after completion
    actual_issues_encountered JSONB, -- Real issues found during implementation
    prediction_accuracy DECIMAL(3,2), -- How accurate was the analysis?
    
    -- Analysis Context
    analyzer_config JSONB, -- Configuration used for this analysis
    submission_context JSONB, -- Context at time of analysis
    
    -- Timestamps
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ, -- When implementation was completed
    
    -- Indexes
    INDEX idx_analysis_history_submission (submission_id, analysis_version),
    INDEX idx_analysis_accuracy (prediction_accuracy, analyzed_at)
);

-- Table: impact_mitigation_templates
-- Reusable mitigation strategy templates
CREATE TABLE IF NOT EXISTS impact_mitigation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template Definition
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'performance', 'security', 'ui', 'api', etc.
    
    -- Template Content
    mitigation_steps JSONB NOT NULL, -- Array of mitigation steps
    risk_reduction_percentage INTEGER CHECK (risk_reduction_percentage >= 0 AND risk_reduction_percentage <= 100),
    estimated_effort_hours INTEGER,
    required_skills JSONB NOT NULL DEFAULT '[]',
    
    -- Applicability
    applicable_components JSONB NOT NULL DEFAULT '[]',
    applicable_risk_levels JSONB NOT NULL DEFAULT '[]',
    
    -- Usage Tracking
    usage_count INTEGER NOT NULL DEFAULT 0,
    success_rate DECIMAL(3,2), -- Success rate when this template is used
    
    -- Metadata
    created_by VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_mitigation_category (category, active),
    INDEX idx_mitigation_usage (usage_count DESC, success_rate DESC)
);

-- Insert default consistency validation rules
INSERT INTO consistency_validation_rules (rule_id, category, name, description, severity, patterns, validator_function) VALUES
-- Design System Rules
('color_palette_consistency', 'design_system', 'Color Palette Consistency', 'Colors must align with established design tokens', 'high', '["color", "background", "theme", "palette"]', 'validateColorConsistency'),
('typography_consistency', 'design_system', 'Typography Consistency', 'Typography changes must follow design system hierarchy', 'high', '["font", "text", "typography", "heading"]', 'validateTypographyConsistency'),
('spacing_consistency', 'design_system', 'Spacing Consistency', 'Spacing must use design system tokens', 'medium', '["spacing", "margin", "padding", "gap"]', 'validateSpacingConsistency'),

-- User Experience Rules
('navigation_consistency', 'user_experience', 'Navigation Consistency', 'Navigation patterns must remain consistent', 'critical', '["navigation", "menu", "breadcrumb", "routing"]', 'validateNavigationConsistency'),
('interaction_consistency', 'user_experience', 'Interaction Consistency', 'User interactions must follow established patterns', 'high', '["click", "hover", "interaction", "behavior"]', 'validateInteractionConsistency'),
('feedback_consistency', 'user_experience', 'Feedback Consistency', 'User feedback mechanisms must be consistent', 'medium', '["feedback", "message", "notification", "alert"]', 'validateFeedbackConsistency'),

-- Technical Rules
('api_consistency', 'technical', 'API Consistency', 'API changes must maintain backward compatibility', 'critical', '["api", "endpoint", "service", "integration"]', 'validateApiConsistency'),
('data_consistency', 'technical', 'Data Consistency', 'Data structures must maintain referential integrity', 'critical', '["database", "schema", "data", "model"]', 'validateDataConsistency'),
('performance_consistency', 'technical', 'Performance Consistency', 'Changes must not degrade performance standards', 'high', '["performance", "speed", "loading", "optimization"]', 'validatePerformanceConsistency'),

-- Business Logic Rules
('workflow_consistency', 'business_logic', 'Workflow Consistency', 'Business workflows must remain logical and complete', 'critical', '["workflow", "process", "business", "logic"]', 'validateWorkflowConsistency'),
('permissions_consistency', 'business_logic', 'Permissions Consistency', 'Permission changes must maintain security model', 'critical', '["permission", "access", "role", "security"]', 'validatePermissionsConsistency'),
('validation_consistency', 'business_logic', 'Validation Consistency', 'Validation rules must be consistently applied', 'high', '["validation", "rules", "constraints", "requirements"]', 'validateValidationConsistency');

-- Insert default mitigation templates
INSERT INTO impact_mitigation_templates (name, description, category, mitigation_steps, risk_reduction_percentage, estimated_effort_hours, required_skills, applicable_components, applicable_risk_levels) VALUES
('Phased Rollout Strategy', 'Implement changes in phases to reduce risk', 'deployment', 
 '["Phase 1: Feature flag implementation", "Phase 2: Internal testing", "Phase 3: Beta user rollout", "Phase 4: Full deployment"]', 
 40, 16, '["deployment", "feature-flags"]', '["ui", "api", "database"]', '["medium", "high", "critical"]'),

('API Versioning Strategy', 'Maintain backward compatibility through API versioning', 'api',
 '["Create new API version", "Deprecate old endpoints gradually", "Update documentation", "Notify integration partners"]',
 60, 24, '["backend", "api-design"]', '["api"]', '["high", "critical"]'),

('Database Migration with Rollback', 'Safe database schema changes with rollback capability', 'database',
 '["Create migration scripts", "Test on staging", "Backup production data", "Execute with rollback plan"]',
 70, 32, '["database", "devops"]', '["database"]', '["high", "critical"]'),

('Design System Update Protocol', 'Systematic design system updates', 'design_system',
 '["Update design tokens", "Update component library", "Test across applications", "Deploy systematically"]',
 50, 20, '["design", "frontend"]', '["ui", "design-system"]', '["medium", "high"]'),

('Comprehensive Testing Strategy', 'Enhanced testing for high-risk changes', 'testing',
 '["Unit test coverage", "Integration testing", "End-to-end testing", "Performance testing", "User acceptance testing"]',
 80, 40, '["testing", "qa"]', '["ui", "api", "database"]', '["high", "critical"]');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_impact_analyses_submission ON submission_impact_analyses(submission_id);
CREATE INDEX IF NOT EXISTS idx_impact_analyses_risk_score ON submission_impact_analyses(risk_level, impact_score);
CREATE INDEX IF NOT EXISTS idx_consistency_validations_submission ON submission_consistency_validations(submission_id);
CREATE INDEX IF NOT EXISTS idx_consistency_validations_passed ON submission_consistency_validations(passed, overall_risk);
CREATE INDEX IF NOT EXISTS idx_components_risk_level ON impact_analysis_components(risk_level, component_name);

-- Create update triggers for timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_impact_analyses_modtime 
    BEFORE UPDATE ON submission_impact_analyses 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_consistency_validations_modtime 
    BEFORE UPDATE ON submission_consistency_validations 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_validation_rules_modtime 
    BEFORE UPDATE ON consistency_validation_rules 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_mitigation_templates_modtime 
    BEFORE UPDATE ON impact_mitigation_templates 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Add comments for documentation
COMMENT ON TABLE submission_impact_analyses IS 'Stores comprehensive impact analysis results for directive submissions';
COMMENT ON TABLE submission_consistency_validations IS 'Stores consistency validation results and blocking issues';
COMMENT ON TABLE impact_analysis_components IS 'Detailed breakdown of components affected by changes';
COMMENT ON TABLE consistency_validation_rules IS 'Configuration for consistency validation rules';
COMMENT ON TABLE impact_analysis_history IS 'Historical tracking for analysis accuracy and learning';
COMMENT ON TABLE impact_mitigation_templates IS 'Reusable mitigation strategy templates';

-- Add RLS policies if needed (assuming RLS is enabled)
-- These would be customized based on your specific security requirements
/*
ALTER TABLE submission_impact_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_consistency_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE impact_analysis_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own impact analyses" ON submission_impact_analyses
    FOR ALL USING (auth.uid() = created_by);
    
-- Add more policies as needed
*/