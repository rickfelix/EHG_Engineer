-- LEO Protocol v4.3.1 - UI Validation Enhancement Schema
-- Purpose: Enforce mandatory testing validation for all UI implementations
-- Created: 2025-09-04

-- 1. UI Validation Results Table
CREATE TABLE IF NOT EXISTS ui_validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL,
    sd_id VARCHAR(255),
    test_run_id VARCHAR(255) UNIQUE NOT NULL,
    test_type VARCHAR(50) NOT NULL, -- 'playwright', 'visual_regression', 'prd_validation'
    
    -- Test Results
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Validation Status
    validation_status VARCHAR(50) NOT NULL, -- 'passed', 'failed', 'partial', 'blocked'
    ui_complete BOOLEAN DEFAULT FALSE,
    gaps_detected JSONB DEFAULT '[]',
    
    -- Evidence
    screenshots JSONB DEFAULT '[]',
    test_report JSONB,
    error_logs TEXT,
    
    -- Metadata
    tested_by VARCHAR(100) DEFAULT 'Testing Sub-Agent',
    test_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PRD to UI Mappings Table
CREATE TABLE IF NOT EXISTS prd_ui_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL,
    requirement_id VARCHAR(255) NOT NULL,
    requirement_text TEXT NOT NULL,
    
    -- UI Element Mapping
    ui_component VARCHAR(255),
    ui_selector VARCHAR(255),
    ui_testid VARCHAR(255),
    expected_behavior TEXT,
    
    -- Validation Status
    is_implemented BOOLEAN DEFAULT FALSE,
    is_validated BOOLEAN DEFAULT FALSE,
    validation_date TIMESTAMP WITH TIME ZONE,
    validation_screenshot VARCHAR(500),
    
    -- Metadata
    priority VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(prd_id, requirement_id)
);

-- 3. Validation Evidence Table
CREATE TABLE IF NOT EXISTS validation_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID REFERENCES ui_validation_results(id) ON DELETE CASCADE,
    evidence_type VARCHAR(50) NOT NULL, -- 'screenshot', 'report', 'video', 'log'
    
    -- Evidence Data
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Evidence Context
    component_name VARCHAR(255),
    test_case VARCHAR(255),
    viewport_size VARCHAR(50), -- 'mobile', 'tablet', 'desktop', '1920x1080'
    
    -- Analysis Results
    elements_found JSONB DEFAULT '[]',
    elements_missing JSONB DEFAULT '[]',
    accessibility_issues JSONB DEFAULT '[]',
    performance_metrics JSONB,
    
    -- Metadata
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Validation Rules Enhancement
INSERT INTO leo_validation_rules (rule_code, rule_name, description, enforcement_level, active) VALUES
('UI_REQUIRES_TESTING', 'UI Implementation Requires Testing Validation', 'All UI implementations must be validated by Testing Sub-Agent before completion', 'mandatory', true),
('SCREENSHOT_EVIDENCE', 'Screenshot Evidence Mandatory', 'UI tasks require screenshot evidence from automated testing', 'mandatory', true),
('DESIGN_NEEDS_VERIFICATION', 'Design Output Requires Testing Verification', 'Design Sub-Agent outputs must be verified by Testing Sub-Agent', 'mandatory', true),
('PRD_UI_GAP_CHECK', 'PRD to UI Gap Analysis Required', 'Testing must validate all PRD UI requirements are implemented', 'mandatory', true),
('VISUAL_REGRESSION', 'Visual Regression Testing for UI Changes', 'UI changes require visual regression testing against baseline', 'recommended', true)
ON CONFLICT (rule_code) DO UPDATE SET
    active = true,
    enforcement_level = EXCLUDED.enforcement_level,
    updated_at = CURRENT_TIMESTAMP;

-- 5. Validation Checkpoints Table
CREATE TABLE IF NOT EXISTS ui_validation_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkpoint_name VARCHAR(255) NOT NULL,
    checkpoint_type VARCHAR(50) NOT NULL, -- 'pre_completion', 'post_implementation', 'regression'
    
    -- Checkpoint Configuration
    required_tests JSONB DEFAULT '[]',
    required_coverage DECIMAL(5,2) DEFAULT 80.0,
    required_screenshots INTEGER DEFAULT 3,
    block_on_failure BOOLEAN DEFAULT TRUE,
    
    -- Status
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default checkpoints
INSERT INTO ui_validation_checkpoints (checkpoint_name, checkpoint_type, required_tests, block_on_failure) VALUES
('UI Implementation Validation', 'post_implementation', '["component_render", "responsive_design", "accessibility"]', TRUE),
('PRD Requirement Verification', 'pre_completion', '["prd_mapping", "feature_coverage", "gap_analysis"]', TRUE),
('Visual Regression Check', 'regression', '["screenshot_comparison", "layout_stability"]', FALSE);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ui_validation_prd ON ui_validation_results(prd_id);
CREATE INDEX IF NOT EXISTS idx_ui_validation_status ON ui_validation_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_prd_mappings_prd ON prd_ui_mappings(prd_id);
CREATE INDEX IF NOT EXISTS idx_prd_mappings_implemented ON prd_ui_mappings(is_implemented);
CREATE INDEX IF NOT EXISTS idx_evidence_validation ON validation_evidence(validation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON validation_evidence(evidence_type);

-- 7. Create validation summary view
CREATE OR REPLACE VIEW ui_validation_summary AS
SELECT 
    v.prd_id,
    v.sd_id,
    v.validation_status,
    v.success_rate,
    v.total_tests,
    v.passed_tests,
    v.failed_tests,
    COUNT(DISTINCT e.id) as evidence_count,
    COUNT(DISTINCT CASE WHEN e.evidence_type = 'screenshot' THEN e.id END) as screenshot_count,
    COALESCE(
        (SELECT COUNT(*) FROM prd_ui_mappings WHERE prd_id = v.prd_id AND is_implemented = true),
        0
    ) as implemented_requirements,
    COALESCE(
        (SELECT COUNT(*) FROM prd_ui_mappings WHERE prd_id = v.prd_id),
        0
    ) as total_requirements,
    v.created_at as last_validation_date
FROM ui_validation_results v
LEFT JOIN validation_evidence e ON e.validation_id = v.id
GROUP BY v.id, v.prd_id, v.sd_id, v.validation_status, v.success_rate, 
         v.total_tests, v.passed_tests, v.failed_tests, v.created_at
ORDER BY v.created_at DESC;

-- 8. Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_ui_validation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ui_validation_results_timestamp
    BEFORE UPDATE ON ui_validation_results
    FOR EACH ROW
    EXECUTE FUNCTION update_ui_validation_timestamp();

CREATE TRIGGER update_prd_ui_mappings_timestamp
    BEFORE UPDATE ON prd_ui_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_ui_validation_timestamp();

-- 9. Add validation enforcement function
CREATE OR REPLACE FUNCTION enforce_ui_validation(
    p_prd_id VARCHAR(255),
    p_mark_complete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_validation_result JSONB;
    v_has_validation BOOLEAN;
    v_validation_passed BOOLEAN;
    v_gaps_found INTEGER;
BEGIN
    -- Check if validation exists
    SELECT EXISTS(
        SELECT 1 FROM ui_validation_results 
        WHERE prd_id = p_prd_id 
        AND created_at > (CURRENT_TIMESTAMP - INTERVAL '24 hours')
    ) INTO v_has_validation;
    
    -- Check if validation passed
    SELECT validation_status = 'passed', 
           COALESCE(jsonb_array_length(gaps_detected), 0)
    INTO v_validation_passed, v_gaps_found
    FROM ui_validation_results 
    WHERE prd_id = p_prd_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Build result
    v_validation_result := jsonb_build_object(
        'prd_id', p_prd_id,
        'has_validation', v_has_validation,
        'validation_passed', COALESCE(v_validation_passed, FALSE),
        'gaps_found', COALESCE(v_gaps_found, -1),
        'can_complete', v_has_validation AND COALESCE(v_validation_passed, FALSE),
        'message', CASE
            WHEN NOT v_has_validation THEN 'No UI validation found - Testing Sub-Agent must validate first'
            WHEN v_gaps_found > 0 THEN format('Cannot complete - %s UI gaps detected', v_gaps_found)
            WHEN NOT v_validation_passed THEN 'UI validation failed - fix issues and retest'
            ELSE 'UI validation passed - can proceed to completion'
        END
    );
    
    -- If attempting to mark complete, enforce validation
    IF p_mark_complete AND NOT (v_has_validation AND COALESCE(v_validation_passed, FALSE)) THEN
        RAISE EXCEPTION 'Cannot mark UI task complete without passed validation. %', 
            v_validation_result->>'message';
    END IF;
    
    RETURN v_validation_result;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON ui_validation_results TO authenticated;
GRANT ALL ON prd_ui_mappings TO authenticated;
GRANT ALL ON validation_evidence TO authenticated;
GRANT ALL ON ui_validation_checkpoints TO authenticated;
GRANT SELECT ON ui_validation_summary TO authenticated;

COMMENT ON TABLE ui_validation_results IS 'Stores UI validation test results from Testing Sub-Agent';
COMMENT ON TABLE prd_ui_mappings IS 'Maps PRD requirements to actual UI implementations';
COMMENT ON TABLE validation_evidence IS 'Stores screenshots and test evidence for UI validation';
COMMENT ON TABLE ui_validation_checkpoints IS 'Defines mandatory validation checkpoints in UI workflow';
COMMENT ON FUNCTION enforce_ui_validation IS 'Enforces UI validation before allowing completion';