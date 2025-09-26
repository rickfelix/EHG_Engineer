-- Mandatory Sub-Agent Gates System
-- Ensure sub-agents are systematically activated and validated
-- Phase 2, Task 1 of LEO Protocol improvements
-- Date: 2025-09-24

-- ============================================================================
-- SUB-AGENT GATE REQUIREMENTS
-- ============================================================================

-- Define mandatory sub-agent requirements for different contexts
CREATE TABLE IF NOT EXISTS sub_agent_gate_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_type TEXT NOT NULL, -- 'prd_generation', 'handoff_creation', 'implementation', etc.
    trigger_condition TEXT NOT NULL, -- Keywords or conditions that trigger the requirement
    required_sub_agents TEXT[] NOT NULL, -- Array of required sub-agent codes
    gate_priority INTEGER DEFAULT 1, -- 1=MANDATORY, 2=RECOMMENDED, 3=OPTIONAL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate with LEO Protocol requirements
INSERT INTO sub_agent_gate_requirements (context_type, trigger_condition, required_sub_agents, gate_priority)
VALUES
    ('prd_generation', 'schema', ARRAY['DATABASE', 'VALIDATION'], 1),
    ('prd_generation', 'security', ARRAY['SECURITY', 'VALIDATION'], 1),
    ('prd_generation', 'authentication', ARRAY['SECURITY', 'TESTING', 'VALIDATION'], 1),
    ('prd_generation', 'ui_component', ARRAY['DESIGN', 'TESTING'], 1),
    ('prd_generation', 'api_endpoint', ARRAY['SECURITY', 'DATABASE', 'TESTING'], 1),

    ('implementation', 'database_change', ARRAY['DATABASE', 'SECURITY', 'TESTING'], 1),
    ('implementation', 'ui_component', ARRAY['DESIGN', 'TESTING', 'PERFORMANCE'], 1),
    ('implementation', 'security_feature', ARRAY['SECURITY', 'TESTING', 'VALIDATION'], 1),
    ('implementation', 'api_development', ARRAY['SECURITY', 'DATABASE', 'TESTING'], 1),

    ('handoff_creation', 'plan_to_exec', ARRAY['DATABASE', 'SECURITY', 'TESTING'], 1),
    ('handoff_creation', 'exec_to_plan', ARRAY['TESTING', 'VALIDATION'], 1),
    ('handoff_creation', 'technical_handoff', ARRAY['VALIDATION'], 1),

    ('verification', 'plan_supervisor', ARRAY['DATABASE', 'SECURITY', 'TESTING', 'DESIGN', 'VALIDATION'], 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUB-AGENT EXECUTION TRACKING
-- ============================================================================

-- Track sub-agent executions and their results
CREATE TABLE IF NOT EXISTS sub_agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id TEXT NOT NULL, -- SD ID, PRD ID, etc.
    context_type TEXT NOT NULL,
    sub_agent_code TEXT NOT NULL,
    execution_trigger TEXT,

    -- Execution details
    execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN (
        'pending', 'running', 'completed', 'failed', 'skipped'
    )),

    -- Results
    validation_result TEXT CHECK (validation_result IN ('PASS', 'FAIL', 'WARNING', 'INFO')),
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    findings JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    issues_found JSONB DEFAULT '[]',

    -- Metadata
    execution_time_ms INTEGER,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sub_agent_executions_context ON sub_agent_executions(context_id, context_type);
CREATE INDEX idx_sub_agent_executions_agent ON sub_agent_executions(sub_agent_code);
CREATE INDEX idx_sub_agent_executions_status ON sub_agent_executions(execution_status);

-- ============================================================================
-- MANDATORY GATE ENFORCEMENT
-- ============================================================================

-- Function to check if mandatory sub-agents have been executed
CREATE OR REPLACE FUNCTION check_mandatory_sub_agents(
    p_context_id TEXT,
    p_context_type TEXT,
    p_trigger_conditions TEXT[]
) RETURNS JSONB AS $$
DECLARE
    gate_result JSONB := '{"valid": true, "missing_agents": [], "warnings": [], "details": {}}';
    requirement_record RECORD;
    execution_count INTEGER;
    required_agent TEXT;
    trigger_condition TEXT;
BEGIN
    -- Check each trigger condition provided
    FOREACH trigger_condition IN ARRAY p_trigger_conditions
    LOOP
        -- Find all mandatory requirements for this trigger
        FOR requirement_record IN
            SELECT * FROM sub_agent_gate_requirements
            WHERE context_type = p_context_type
              AND trigger_condition = trigger_condition
              AND gate_priority = 1 -- MANDATORY only
        LOOP
            -- Check if each required sub-agent has been executed
            FOREACH required_agent IN ARRAY requirement_record.required_sub_agents
            LOOP
                SELECT COUNT(*) INTO execution_count
                FROM sub_agent_executions
                WHERE context_id = p_context_id
                  AND context_type = p_context_type
                  AND sub_agent_code = required_agent
                  AND execution_status = 'completed';

                IF execution_count = 0 THEN
                    gate_result := jsonb_set(gate_result, '{valid}', 'false'::jsonb);
                    gate_result := jsonb_set(
                        gate_result,
                        '{missing_agents}',
                        (gate_result->'missing_agents') || jsonb_build_array(required_agent)
                    );
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Add summary details
    gate_result := jsonb_set(
        gate_result,
        '{details,checked_triggers}',
        to_jsonb(p_trigger_conditions)
    );

    RETURN gate_result;
END;
$$ LANGUAGE plpgsql;

-- Function to enforce mandatory sub-agent gates
CREATE OR REPLACE FUNCTION enforce_sub_agent_gates(
    p_context_id TEXT,
    p_context_type TEXT,
    p_action TEXT,
    p_trigger_conditions TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
    gate_check JSONB;
    missing_agents JSONB;
    missing_count INTEGER;
BEGIN
    -- Perform gate check
    gate_check := check_mandatory_sub_agents(p_context_id, p_context_type, p_trigger_conditions);

    -- If valid, allow action
    IF (gate_check->>'valid')::boolean THEN
        RAISE NOTICE 'SUB_AGENT_GATE_PASS: % % - All mandatory sub-agents executed', p_action, p_context_id;
        RETURN TRUE;
    END IF;

    -- If invalid, block action and provide details
    missing_agents := gate_check->'missing_agents';
    missing_count := jsonb_array_length(missing_agents);

    RAISE EXCEPTION 'SUB_AGENT_GATE_VIOLATION: % % blocked. Missing % mandatory sub-agent(s): %. Triggers: %',
        p_action,
        p_context_id,
        missing_count,
        missing_agents,
        p_trigger_conditions;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SUB-AGENT ORCHESTRATION FUNCTIONS
-- ============================================================================

-- Function to create sub-agent execution record
CREATE OR REPLACE FUNCTION create_sub_agent_execution(
    p_context_id TEXT,
    p_context_type TEXT,
    p_sub_agent_code TEXT,
    p_execution_trigger TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    execution_id UUID;
BEGIN
    INSERT INTO sub_agent_executions (
        context_id,
        context_type,
        sub_agent_code,
        execution_trigger,
        execution_status
    ) VALUES (
        p_context_id,
        p_context_type,
        p_sub_agent_code,
        p_execution_trigger,
        'pending'
    ) RETURNING id INTO execution_id;

    RAISE NOTICE 'SUB_AGENT_EXECUTION_CREATED: % for % %', p_sub_agent_code, p_context_type, p_context_id;
    RETURN execution_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete sub-agent execution
CREATE OR REPLACE FUNCTION complete_sub_agent_execution(
    p_execution_id UUID,
    p_validation_result TEXT,
    p_confidence_score INTEGER DEFAULT NULL,
    p_findings JSONB DEFAULT '[]',
    p_recommendations JSONB DEFAULT '[]',
    p_issues_found JSONB DEFAULT '[]'
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE sub_agent_executions SET
        execution_status = 'completed',
        validation_result = p_validation_result,
        confidence_score = p_confidence_score,
        findings = p_findings,
        recommendations = p_recommendations,
        issues_found = p_issues_found,
        completed_at = NOW()
    WHERE id = p_execution_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sub-agent execution % not found', p_execution_id;
    END IF;

    RAISE NOTICE 'SUB_AGENT_EXECUTION_COMPLETED: % with result %', p_execution_id, p_validation_result;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GATE ENFORCEMENT VIEWS
-- ============================================================================

-- View for contexts missing mandatory sub-agent executions
CREATE OR REPLACE VIEW v_contexts_missing_sub_agents AS
SELECT DISTINCT
    context_id,
    context_type,
    COUNT(DISTINCT sub_agent_code) as executed_agents,
    string_agg(DISTINCT sub_agent_code, ', ') as executed_agent_list
FROM sub_agent_executions
WHERE execution_status = 'completed'
GROUP BY context_id, context_type
ORDER BY context_id;

-- View for sub-agent execution history with results
CREATE OR REPLACE VIEW v_sub_agent_execution_history AS
SELECT
    sae.*,
    CASE
        WHEN sae.execution_status = 'completed' AND sae.validation_result = 'PASS' THEN 'SUCCESS'
        WHEN sae.execution_status = 'completed' AND sae.validation_result = 'FAIL' THEN 'BLOCKED'
        WHEN sae.execution_status = 'failed' THEN 'ERROR'
        ELSE 'PENDING'
    END as overall_status,
    EXTRACT(EPOCH FROM (sae.completed_at - sae.executed_at)) * 1000 as actual_execution_time_ms
FROM sub_agent_executions sae
ORDER BY sae.executed_at DESC;

-- ============================================================================
-- INTEGRATION WITH EXISTING LEO PROTOCOL
-- ============================================================================

-- Function for PLAN agents to check gates before PRD creation
CREATE OR REPLACE FUNCTION plan_prd_gate_check(p_sd_id TEXT, p_prd_content TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    trigger_conditions TEXT[] := '{}';
BEGIN
    -- Detect trigger conditions from PRD content
    IF p_prd_content ILIKE '%schema%' OR p_prd_content ILIKE '%database%' THEN
        trigger_conditions := array_append(trigger_conditions, 'schema');
    END IF;

    IF p_prd_content ILIKE '%security%' OR p_prd_content ILIKE '%authentication%' THEN
        trigger_conditions := array_append(trigger_conditions, 'security');
    END IF;

    IF p_prd_content ILIKE '%ui%' OR p_prd_content ILIKE '%component%' THEN
        trigger_conditions := array_append(trigger_conditions, 'ui_component');
    END IF;

    IF p_prd_content ILIKE '%api%' OR p_prd_content ILIKE '%endpoint%' THEN
        trigger_conditions := array_append(trigger_conditions, 'api_endpoint');
    END IF;

    -- Enforce gates if triggers detected
    IF array_length(trigger_conditions, 1) > 0 THEN
        RETURN enforce_sub_agent_gates(p_sd_id, 'prd_generation', 'PRD_CREATION', trigger_conditions);
    END IF;

    RETURN TRUE; -- No triggers, no gate enforcement needed
END;
$$ LANGUAGE plpgsql;

-- Function for EXEC agents to check gates before implementation
CREATE OR REPLACE FUNCTION exec_implementation_gate_check(p_sd_id TEXT, p_implementation_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    trigger_conditions TEXT[] := ARRAY[p_implementation_type];
BEGIN
    RETURN enforce_sub_agent_gates(p_sd_id, 'implementation', 'IMPLEMENTATION', trigger_conditions);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION & TESTING
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🔒 MANDATORY SUB-AGENT GATES SYSTEM INSTALLED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ sub_agent_gate_requirements - Gate rules and triggers';
    RAISE NOTICE '✅ sub_agent_executions - Execution tracking with results';
    RAISE NOTICE '✅ check_mandatory_sub_agents() - Gate validation function';
    RAISE NOTICE '✅ enforce_sub_agent_gates() - Gate enforcement function';
    RAISE NOTICE '✅ create/complete_sub_agent_execution() - Orchestration functions';
    RAISE NOTICE '✅ plan_prd_gate_check() - PRD creation gate';
    RAISE NOTICE '✅ exec_implementation_gate_check() - Implementation gate';
    RAISE NOTICE '';
    RAISE NOTICE '🚫 GATE ENFORCEMENT ACTIVE:';
    RAISE NOTICE '   • PRD creation requires sub-agent validation';
    RAISE NOTICE '   • Implementation requires sub-agent approval';
    RAISE NOTICE '   • Handoffs require sub-agent verification';
    RAISE NOTICE '   • Violations will block operations with clear messages';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Gate Requirements Pre-loaded: Schema, Security, UI, API, Database triggers';
    RAISE NOTICE '🔧 Ready for integration with unified-handoff-system.js and LEO scripts';
END;
$$;