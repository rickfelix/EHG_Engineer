-- PLAN Technical Validation Orchestrator Database Schema
-- Stores results from systematic technical validation and risk assessment
-- Date: 2025-09-24

-- 1. Create plan_technical_validations table for storing PLAN validation results
CREATE TABLE IF NOT EXISTS plan_technical_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    -- 4-Domain Technical Validation Framework
    technical_feasibility TEXT CHECK (technical_feasibility IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    implementation_risk TEXT CHECK (implementation_risk IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    resource_timeline TEXT CHECK (resource_timeline IN ('REALISTIC', 'CONSTRAINED', 'UNREALISTIC')) NOT NULL,
    quality_assurance TEXT CHECK (quality_assurance IN ('COMPREHENSIVE', 'STANDARD', 'BASIC')) NOT NULL,

    -- Decision matrix results
    final_decision TEXT CHECK (final_decision IN ('APPROVE', 'CONDITIONAL', 'REDESIGN', 'DEFER', 'REJECT', 'RESEARCH')) NOT NULL,
    complexity_score INTEGER DEFAULT 0 CHECK (complexity_score >= 0 AND complexity_score <= 10),

    -- Sub-agent orchestration results
    sub_agent_reports JSONB DEFAULT '[]'::jsonb,
    quality_gates TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Metadata
    validated_at TIMESTAMPTZ DEFAULT NOW(),
    validator TEXT DEFAULT 'PLAN_TECHNICAL_VALIDATION_ORCHESTRATOR_v1.0',
    validation_version TEXT DEFAULT '1.0',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one validation per SD (or allow re-validations with different timestamps)
    UNIQUE(sd_id, validated_at)
);

-- 2. Create plan_quality_gates table for tracking quality gate completion
CREATE TABLE IF NOT EXISTS plan_quality_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID NOT NULL REFERENCES plan_technical_validations(id) ON DELETE CASCADE,
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    gate_name TEXT NOT NULL,
    gate_type TEXT CHECK (gate_type IN ('SECURITY', 'DATABASE', 'TESTING', 'PERFORMANCE', 'DESIGN', 'VALIDATION')) NOT NULL,
    is_required BOOLEAN DEFAULT true,
    is_complete BOOLEAN DEFAULT false,
    completion_evidence TEXT,

    completed_at TIMESTAMPTZ DEFAULT NULL,
    completed_by TEXT DEFAULT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(validation_id, gate_name)
);

-- 3. Create plan_sub_agent_executions table for detailed sub-agent results
CREATE TABLE IF NOT EXISTS plan_sub_agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID NOT NULL REFERENCES plan_technical_validations(id) ON DELETE CASCADE,
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    sub_agent_type TEXT CHECK (sub_agent_type IN ('SECURITY', 'DATABASE', 'VALIDATION', 'TESTING', 'PERFORMANCE', 'DESIGN', 'DEBUGGING')) NOT NULL,
    execution_status TEXT CHECK (execution_status IN ('PASS', 'FAIL', 'WARNING', 'REVIEW_REQUIRED', 'ERROR')) NOT NULL,
    severity TEXT CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')) NOT NULL,

    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    recommendations TEXT[],

    execution_time_ms INTEGER DEFAULT 0,
    executed_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_plan_validations_sd_id ON plan_technical_validations(sd_id);
CREATE INDEX IF NOT EXISTS idx_plan_validations_decision ON plan_technical_validations(final_decision);
CREATE INDEX IF NOT EXISTS idx_plan_validations_complexity ON plan_technical_validations(complexity_score);
CREATE INDEX IF NOT EXISTS idx_plan_validations_validated_at ON plan_technical_validations(validated_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_quality_gates_validation_id ON plan_quality_gates(validation_id);
CREATE INDEX IF NOT EXISTS idx_plan_quality_gates_sd_id ON plan_quality_gates(sd_id);
CREATE INDEX IF NOT EXISTS idx_plan_quality_gates_complete ON plan_quality_gates(is_complete);

CREATE INDEX IF NOT EXISTS idx_plan_subagent_executions_validation_id ON plan_sub_agent_executions(validation_id);
CREATE INDEX IF NOT EXISTS idx_plan_subagent_executions_type ON plan_sub_agent_executions(sub_agent_type);
CREATE INDEX IF NOT EXISTS idx_plan_subagent_executions_severity ON plan_sub_agent_executions(severity);

-- 5. Create function to get latest PLAN validation for an SD
CREATE OR REPLACE FUNCTION get_latest_plan_validation(p_sd_id TEXT)
RETURNS TABLE (
    validation_id UUID,
    technical_feasibility TEXT,
    implementation_risk TEXT,
    resource_timeline TEXT,
    quality_assurance TEXT,
    final_decision TEXT,
    complexity_score INTEGER,
    sub_agent_count INTEGER,
    quality_gate_count INTEGER,
    validated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ptv.id,
        ptv.technical_feasibility,
        ptv.implementation_risk,
        ptv.resource_timeline,
        ptv.quality_assurance,
        ptv.final_decision,
        ptv.complexity_score,
        (SELECT COUNT(*)::INTEGER FROM plan_sub_agent_executions WHERE validation_id = ptv.id),
        (SELECT COUNT(*)::INTEGER FROM plan_quality_gates WHERE validation_id = ptv.id),
        ptv.validated_at
    FROM plan_technical_validations ptv
    WHERE ptv.sd_id = p_sd_id
    ORDER BY ptv.validated_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to calculate quality gate completion percentage
CREATE OR REPLACE FUNCTION calculate_quality_gate_completion(p_validation_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_gates INTEGER;
    completed_gates INTEGER;
    completion_percentage INTEGER;
BEGIN
    -- Count total and completed gates
    SELECT COUNT(*) INTO total_gates
    FROM plan_quality_gates
    WHERE validation_id = p_validation_id;

    SELECT COUNT(*) INTO completed_gates
    FROM plan_quality_gates
    WHERE validation_id = p_validation_id AND is_complete = true;

    -- Calculate percentage
    IF total_gates = 0 THEN
        RETURN 100; -- No gates means 100% complete
    ELSE
        completion_percentage := ROUND((completed_gates::DECIMAL / total_gates::DECIMAL) * 100);
        RETURN completion_percentage;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Create view for PLAN validation dashboard
CREATE OR REPLACE VIEW v_plan_validation_summary AS
SELECT
    sd.id as sd_id,
    sd.title,
    sd.status,
    sd.target_application,
    sd.priority,
    ptv.final_decision,
    ptv.complexity_score,
    ptv.technical_feasibility,
    ptv.implementation_risk,
    ptv.resource_timeline,
    ptv.quality_assurance,
    ptv.validated_at,
    calculate_quality_gate_completion(ptv.id) as quality_gate_completion_pct,
    CASE
        WHEN ptv.final_decision = 'APPROVE' THEN 'Ready for EXEC handoff'
        WHEN ptv.final_decision = 'CONDITIONAL' THEN 'Address risks before handoff'
        WHEN ptv.final_decision = 'REDESIGN' THEN 'Simplify approach required'
        WHEN ptv.final_decision = 'DEFER' THEN 'Resource constraints'
        WHEN ptv.final_decision = 'REJECT' THEN 'Not technically feasible'
        WHEN ptv.final_decision = 'RESEARCH' THEN 'More analysis required'
        ELSE 'Not validated'
    END as next_action
FROM strategic_directives_v2 sd
LEFT JOIN plan_technical_validations ptv ON sd.id = ptv.sd_id
WHERE ptv.id IS NULL OR ptv.id = (
    SELECT id FROM plan_technical_validations
    WHERE sd_id = sd.id
    ORDER BY validated_at DESC
    LIMIT 1
);

-- 8. Create trigger to auto-populate quality gates when validation is created
CREATE OR REPLACE FUNCTION create_quality_gates_from_validation()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert quality gates based on the quality_gates array
    IF array_length(NEW.quality_gates, 1) > 0 THEN
        INSERT INTO plan_quality_gates (validation_id, sd_id, gate_name, gate_type, is_required)
        SELECT
            NEW.id,
            NEW.sd_id,
            unnest(NEW.quality_gates),
            CASE
                WHEN unnest(NEW.quality_gates) ILIKE '%security%' THEN 'SECURITY'
                WHEN unnest(NEW.quality_gates) ILIKE '%database%' THEN 'DATABASE'
                WHEN unnest(NEW.quality_gates) ILIKE '%test%' THEN 'TESTING'
                WHEN unnest(NEW.quality_gates) ILIKE '%performance%' THEN 'PERFORMANCE'
                WHEN unnest(NEW.quality_gates) ILIKE '%ui%' OR unnest(NEW.quality_gates) ILIKE '%design%' THEN 'DESIGN'
                ELSE 'VALIDATION'
            END,
            true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create the trigger
DROP TRIGGER IF EXISTS trigger_create_quality_gates ON plan_technical_validations;
CREATE TRIGGER trigger_create_quality_gates
    AFTER INSERT ON plan_technical_validations
    FOR EACH ROW
    EXECUTE FUNCTION create_quality_gates_from_validation();

-- 10. Create trigger to update SD status based on PLAN validation
CREATE OR REPLACE FUNCTION update_sd_after_plan_validation()
RETURNS TRIGGER AS $$
BEGIN
    -- Update SD status based on PLAN validation decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'validated'
            WHEN NEW.final_decision = 'REJECT' THEN 'technical_review_required'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'REDESIGN', 'RESEARCH') THEN 'plan_revision_required'
            ELSE status -- Keep current status for DEFER
        END,
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create the trigger
DROP TRIGGER IF EXISTS trigger_update_sd_after_plan_validation ON plan_technical_validations;
CREATE TRIGGER trigger_update_sd_after_plan_validation
    AFTER INSERT ON plan_technical_validations
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_after_plan_validation();

-- 12. Add RLS policies for plan_technical_validations
ALTER TABLE plan_technical_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_quality_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_sub_agent_executions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read validation results
CREATE POLICY plan_validations_select ON plan_technical_validations
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY plan_quality_gates_select ON plan_quality_gates
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY plan_subagent_executions_select ON plan_sub_agent_executions
    FOR SELECT TO authenticated
    USING (true);

-- Allow service role to manage validation data
CREATE POLICY plan_validations_all ON plan_technical_validations
    FOR ALL TO service_role
    USING (true);

CREATE POLICY plan_quality_gates_all ON plan_quality_gates
    FOR ALL TO service_role
    USING (true);

CREATE POLICY plan_subagent_executions_all ON plan_sub_agent_executions
    FOR ALL TO service_role
    USING (true);

-- 13. Add comments for documentation
COMMENT ON TABLE plan_technical_validations IS 'Stores results from PLAN Technical Validation Orchestrator - systematic technical validation and risk assessment';
COMMENT ON COLUMN plan_technical_validations.technical_feasibility IS 'Assessment of technical implementability: HIGH/MEDIUM/LOW';
COMMENT ON COLUMN plan_technical_validations.implementation_risk IS 'Risk level for implementation: HIGH/MEDIUM/LOW';
COMMENT ON COLUMN plan_technical_validations.resource_timeline IS 'Resource availability assessment: REALISTIC/CONSTRAINED/UNREALISTIC';
COMMENT ON COLUMN plan_technical_validations.quality_assurance IS 'QA planning level: COMPREHENSIVE/STANDARD/BASIC';
COMMENT ON COLUMN plan_technical_validations.final_decision IS 'PLAN decision: APPROVE/CONDITIONAL/REDESIGN/DEFER/REJECT/RESEARCH';
COMMENT ON COLUMN plan_technical_validations.complexity_score IS 'Implementation complexity score (0-10)';
COMMENT ON COLUMN plan_technical_validations.sub_agent_reports IS 'JSON array of sub-agent execution results';
COMMENT ON COLUMN plan_technical_validations.quality_gates IS 'Array of required quality gates for implementation';

COMMENT ON TABLE plan_quality_gates IS 'Tracks completion of quality gates defined during PLAN validation';
COMMENT ON TABLE plan_sub_agent_executions IS 'Detailed results from sub-agent executions during PLAN validation';
COMMENT ON FUNCTION get_latest_plan_validation IS 'Returns the most recent PLAN validation for a given SD';
COMMENT ON FUNCTION calculate_quality_gate_completion IS 'Calculates percentage of completed quality gates for a validation';
COMMENT ON VIEW v_plan_validation_summary IS 'Dashboard view showing PLAN validation status for all SDs';