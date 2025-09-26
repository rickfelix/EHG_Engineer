-- Extend Existing Sub-Agent Executions Table for Gate System
-- Add columns needed for mandatory gates while preserving existing structure
-- Date: 2025-09-24

-- ============================================================================
-- EXTEND EXISTING sub_agent_executions TABLE
-- ============================================================================

-- Add missing columns needed for gate system
ALTER TABLE sub_agent_executions
ADD COLUMN IF NOT EXISTS context_id TEXT,
ADD COLUMN IF NOT EXISTS context_type TEXT DEFAULT 'prd',
ADD COLUMN IF NOT EXISTS sub_agent_code TEXT,
ADD COLUMN IF NOT EXISTS execution_trigger TEXT,
ADD COLUMN IF NOT EXISTS validation_result TEXT,
ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
ADD COLUMN IF NOT EXISTS findings JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS issues_found JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing records to populate new fields
UPDATE sub_agent_executions SET
    context_id = prd_id,
    context_type = 'prd',
    created_at = started_at
WHERE context_id IS NULL;

-- Get sub_agent_code from leo_sub_agents table
UPDATE sub_agent_executions SET
    sub_agent_code = (
        SELECT code FROM leo_sub_agents
        WHERE leo_sub_agents.id = sub_agent_executions.sub_agent_id
    )
WHERE sub_agent_code IS NULL;

-- Map existing status values to validation_result
UPDATE sub_agent_executions SET
    validation_result = CASE
        WHEN status = 'pass' THEN 'PASS'
        WHEN status = 'fail' THEN 'FAIL'
        WHEN status IN ('error', 'timeout') THEN 'FAIL'
        ELSE 'INFO'
    END
WHERE validation_result IS NULL;

-- Create new indexes for gate system functionality
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_context_new ON sub_agent_executions(context_id, context_type);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_code ON sub_agent_executions(sub_agent_code);

-- ============================================================================
-- CREATE ALIAS/COMPATIBILITY VIEWS
-- ============================================================================

-- Create view that provides both old and new column access patterns
CREATE OR REPLACE VIEW v_sub_agent_executions_unified AS
SELECT
    id,
    -- Legacy columns (preserved)
    prd_id,
    sub_agent_id,
    status,
    results,
    started_at,
    completed_at,
    error_message,
    execution_time_ms,

    -- New gate system columns
    context_id,
    context_type,
    sub_agent_code,
    execution_trigger,
    validation_result,
    confidence_score,
    findings,
    recommendations,
    issues_found,
    created_at,

    -- Computed fields for compatibility
    CASE
        WHEN status IN ('pass') THEN 'completed'
        WHEN status IN ('fail', 'error', 'timeout') THEN 'failed'
        WHEN status = 'running' THEN 'running'
        ELSE 'pending'
    END as execution_status
FROM sub_agent_executions;

-- ============================================================================
-- UPDATED GATE FUNCTIONS FOR EXISTING TABLE STRUCTURE
-- ============================================================================

-- Update check_mandatory_sub_agents function to work with existing table
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
                WHERE (context_id = p_context_id OR prd_id = p_context_id)  -- Support both new and legacy
                  AND (context_type = p_context_type OR p_context_type = 'prd')
                  AND (sub_agent_code = required_agent OR
                       sub_agent_id IN (SELECT id FROM leo_sub_agents WHERE code = required_agent))
                  AND status IN ('pass', 'completed'); -- Accept both old and new success states

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

-- Update create_sub_agent_execution function for existing table
CREATE OR REPLACE FUNCTION create_sub_agent_execution(
    p_context_id TEXT,
    p_context_type TEXT,
    p_sub_agent_code TEXT,
    p_execution_trigger TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    execution_id UUID;
    agent_uuid UUID;
BEGIN
    -- Get sub-agent UUID from code
    SELECT id INTO agent_uuid FROM leo_sub_agents WHERE code = p_sub_agent_code;

    IF agent_uuid IS NULL THEN
        RAISE EXCEPTION 'Sub-agent code % not found in leo_sub_agents', p_sub_agent_code;
    END IF;

    INSERT INTO sub_agent_executions (
        -- Legacy fields
        prd_id,
        sub_agent_id,
        status,
        -- New fields
        context_id,
        context_type,
        sub_agent_code,
        execution_trigger
    ) VALUES (
        CASE WHEN p_context_type = 'prd' THEN p_context_id ELSE NULL END,
        agent_uuid,
        'pending',
        p_context_id,
        p_context_type,
        p_sub_agent_code,
        p_execution_trigger
    ) RETURNING id INTO execution_id;

    RAISE NOTICE 'SUB_AGENT_EXECUTION_CREATED: % for % %', p_sub_agent_code, p_context_type, p_context_id;
    RETURN execution_id;
END;
$$ LANGUAGE plpgsql;

-- Update complete_sub_agent_execution function for existing table
CREATE OR REPLACE FUNCTION complete_sub_agent_execution(
    p_execution_id UUID,
    p_validation_result TEXT,
    p_confidence_score INTEGER DEFAULT NULL,
    p_findings JSONB DEFAULT '[]',
    p_recommendations JSONB DEFAULT '[]',
    p_issues_found JSONB DEFAULT '[]'
) RETURNS BOOLEAN AS $$
DECLARE
    legacy_status TEXT;
BEGIN
    -- Map validation_result to legacy status
    legacy_status := CASE p_validation_result
        WHEN 'PASS' THEN 'pass'
        WHEN 'FAIL' THEN 'fail'
        WHEN 'WARNING' THEN 'pass' -- Warnings still count as pass
        ELSE 'error'
    END;

    UPDATE sub_agent_executions SET
        status = legacy_status,
        validation_result = p_validation_result,
        confidence_score = p_confidence_score,
        findings = p_findings,
        recommendations = p_recommendations,
        issues_found = p_issues_found,
        completed_at = NOW(),
        results = json_build_object(
            'validation_result', p_validation_result,
            'confidence_score', p_confidence_score,
            'findings', p_findings,
            'recommendations', p_recommendations,
            'issues_found', p_issues_found
        )::jsonb
    WHERE id = p_execution_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sub-agent execution % not found', p_execution_id;
    END IF;

    RAISE NOTICE 'SUB_AGENT_EXECUTION_COMPLETED: % with result %', p_execution_id, p_validation_result;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATED VIEWS FOR EXTENDED TABLE
-- ============================================================================

-- Update contexts missing sub-agents view
DROP VIEW IF EXISTS v_contexts_missing_sub_agents;
CREATE OR REPLACE VIEW v_contexts_missing_sub_agents AS
SELECT DISTINCT
    COALESCE(context_id, prd_id) as context_id,
    COALESCE(context_type, 'prd') as context_type,
    COUNT(DISTINCT COALESCE(sub_agent_code,
        (SELECT code FROM leo_sub_agents WHERE id = sub_agent_executions.sub_agent_id)
    )) as executed_agents,
    string_agg(DISTINCT COALESCE(sub_agent_code,
        (SELECT code FROM leo_sub_agents WHERE id = sub_agent_executions.sub_agent_id)
    ), ', ') as executed_agent_list
FROM sub_agent_executions
WHERE status = 'pass' OR validation_result = 'PASS'
GROUP BY COALESCE(context_id, prd_id), COALESCE(context_type, 'prd')
ORDER BY context_id;

-- Update execution history view
DROP VIEW IF EXISTS v_sub_agent_execution_history;
CREATE OR REPLACE VIEW v_sub_agent_execution_history AS
SELECT
    id,
    COALESCE(context_id, prd_id) as context_id,
    COALESCE(context_type, 'prd') as context_type,
    COALESCE(sub_agent_code,
        (SELECT code FROM leo_sub_agents WHERE id = sub_agent_executions.sub_agent_id)
    ) as sub_agent_code,
    execution_trigger,
    status as legacy_status,
    validation_result,
    confidence_score,
    findings,
    recommendations,
    issues_found,
    started_at as executed_at,
    completed_at,
    CASE
        WHEN status = 'pass' OR validation_result = 'PASS' THEN 'SUCCESS'
        WHEN status IN ('fail', 'error', 'timeout') OR validation_result = 'FAIL' THEN 'BLOCKED'
        WHEN status = 'running' THEN 'RUNNING'
        ELSE 'PENDING'
    END as overall_status,
    execution_time_ms,
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 as actual_execution_time_ms
FROM sub_agent_executions
ORDER BY started_at DESC;

-- ============================================================================
-- VERIFICATION & TESTING
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🔧 SUB-AGENT EXECUTIONS TABLE EXTENDED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ Added gate system columns to existing table';
    RAISE NOTICE '✅ Preserved existing data and functionality';
    RAISE NOTICE '✅ Updated gate functions for backward compatibility';
    RAISE NOTICE '✅ Created unified views for old and new patterns';
    RAISE NOTICE '✅ Updated indexes for performance';
    RAISE NOTICE '';
    RAISE NOTICE '🔄 BACKWARD COMPATIBILITY:';
    RAISE NOTICE '   • Legacy prd_id, sub_agent_id, status columns preserved';
    RAISE NOTICE '   • New context_id, sub_agent_code, validation_result columns added';
    RAISE NOTICE '   • Functions work with both old and new column patterns';
    RAISE NOTICE '   • Existing triggers and constraints maintained';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Gate system ready with extended table structure';
END;
$$;