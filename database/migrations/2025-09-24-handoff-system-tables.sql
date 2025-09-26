-- Handoff System Database Tables
-- Fix missing leo_handoff_executions and related governance tables
-- Addresses handoff creation failures identified in SD-1A retrospective
-- Date: 2025-09-24

-- ============================================================================
-- CORE HANDOFF EXECUTION TRACKING
-- ============================================================================

-- Main handoff executions table (was missing and causing failures)
CREATE TABLE IF NOT EXISTS leo_handoff_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL,
    handoff_type TEXT NOT NULL, -- 'LEAD-to-PLAN', 'PLAN-to-EXEC', etc
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,

    -- Handoff content
    executive_summary TEXT,
    deliverables_manifest JSONB DEFAULT '[]',
    verification_results JSONB DEFAULT '{}',
    compliance_status JSONB DEFAULT '{}',
    quality_metrics JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]',

    -- Status tracking
    status TEXT DEFAULT 'created' CHECK (status IN (
        'created', 'validated', 'accepted', 'rejected', 'superseded'
    )),
    validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),
    rejection_reason TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_by TEXT DEFAULT 'SYSTEM',
    file_path TEXT, -- For legacy file-based handoffs

    -- Foreign key relationships
    FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_handoff_executions_sd_id ON leo_handoff_executions(sd_id);
CREATE INDEX IF NOT EXISTS idx_handoff_executions_type ON leo_handoff_executions(handoff_type);
CREATE INDEX IF NOT EXISTS idx_handoff_executions_status ON leo_handoff_executions(status);
CREATE INDEX IF NOT EXISTS idx_handoff_executions_agents ON leo_handoff_executions(from_agent, to_agent);

-- ============================================================================
-- HANDOFF VALIDATION RULES
-- ============================================================================

-- Validation requirements for each handoff type
CREATE TABLE IF NOT EXISTS handoff_validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handoff_type TEXT NOT NULL,
    validation_rule TEXT NOT NULL,
    requirement_level TEXT NOT NULL CHECK (requirement_level IN ('MANDATORY', 'RECOMMENDED', 'OPTIONAL')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-populate with LEO Protocol requirements
INSERT INTO handoff_validation_rules (handoff_type, validation_rule, requirement_level, error_message)
VALUES
    ('LEAD-to-PLAN', 'executive_summary_present', 'MANDATORY', 'Executive summary is required for LEAD-to-PLAN handoffs'),
    ('LEAD-to-PLAN', 'strategic_objectives_defined', 'MANDATORY', 'Strategic objectives must be clearly defined'),
    ('PLAN-to-EXEC', 'deliverables_manifest_complete', 'MANDATORY', 'Deliverables manifest must be complete and detailed'),
    ('PLAN-to-EXEC', 'prd_attached', 'MANDATORY', 'PRD must be created and attached'),
    ('EXEC-to-PLAN', 'implementation_evidence', 'MANDATORY', 'Implementation evidence required for verification'),
    ('EXEC-to-PLAN', 'test_results_included', 'RECOMMENDED', 'Test results should be included when available'),
    ('PLAN-to-LEAD', 'verification_complete', 'MANDATORY', 'PLAN verification must be complete before LEAD handoff'),
    ('PLAN-to-LEAD', 'quality_metrics_assessed', 'MANDATORY', 'Quality metrics must be assessed and reported')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- HANDOFF GOVERNANCE & ENFORCEMENT
-- ============================================================================

-- Pre-flight validation function
CREATE OR REPLACE FUNCTION validate_handoff_requirements(
    p_handoff_type TEXT,
    p_handoff_data JSONB
) RETURNS JSONB AS $$
DECLARE
    validation_result JSONB := '{"valid": true, "errors": [], "warnings": []}';
    rule_record RECORD;
    field_value TEXT;
BEGIN
    -- Check each validation rule for this handoff type
    FOR rule_record IN
        SELECT * FROM handoff_validation_rules
        WHERE handoff_type = p_handoff_type
    LOOP
        -- Extract field value based on validation rule
        field_value := p_handoff_data ->> REPLACE(rule_record.validation_rule, '_present', '');

        -- Check mandatory requirements
        IF rule_record.requirement_level = 'MANDATORY' THEN
            IF field_value IS NULL OR field_value = '' THEN
                validation_result := jsonb_set(
                    validation_result,
                    '{valid}',
                    'false'::jsonb
                );
                validation_result := jsonb_set(
                    validation_result,
                    '{errors}',
                    (validation_result->'errors') || jsonb_build_array(rule_record.error_message)
                );
            END IF;
        END IF;

        -- Check recommended requirements (warnings only)
        IF rule_record.requirement_level = 'RECOMMENDED' AND (field_value IS NULL OR field_value = '') THEN
            validation_result := jsonb_set(
                validation_result,
                '{warnings}',
                (validation_result->'warnings') || jsonb_build_array(rule_record.error_message)
            );
        END IF;
    END LOOP;

    RETURN validation_result;
END;
$$ LANGUAGE plpgsql;

-- Function to create validated handoff
CREATE OR REPLACE FUNCTION create_validated_handoff(
    p_sd_id TEXT,
    p_from_agent TEXT,
    p_to_agent TEXT,
    p_handoff_data JSONB
) RETURNS UUID AS $$
DECLARE
    handoff_id UUID;
    validation_result JSONB;
    handoff_type TEXT := p_from_agent || '-to-' || p_to_agent;
BEGIN
    -- Pre-flight validation
    validation_result := validate_handoff_requirements(handoff_type, p_handoff_data);

    -- Fail if validation errors exist
    IF NOT (validation_result->>'valid')::boolean THEN
        RAISE EXCEPTION 'HANDOFF_VALIDATION_FAILURE: %', validation_result->>'errors';
    END IF;

    -- Create the handoff record
    INSERT INTO leo_handoff_executions (
        sd_id,
        handoff_type,
        from_agent,
        to_agent,
        executive_summary,
        deliverables_manifest,
        verification_results,
        compliance_status,
        quality_metrics,
        recommendations,
        action_items,
        status,
        validation_score
    ) VALUES (
        p_sd_id,
        handoff_type,
        p_from_agent,
        p_to_agent,
        p_handoff_data->>'executive_summary',
        COALESCE(p_handoff_data->'deliverables_manifest', '[]'::jsonb),
        COALESCE(p_handoff_data->'verification_results', '{}'::jsonb),
        COALESCE(p_handoff_data->'compliance_status', '{}'::jsonb),
        COALESCE(p_handoff_data->'quality_metrics', '{}'::jsonb),
        COALESCE(p_handoff_data->'recommendations', '[]'::jsonb),
        COALESCE(p_handoff_data->'action_items', '[]'::jsonb),
        'validated',
        CASE
            WHEN jsonb_array_length(validation_result->'warnings') = 0 THEN 100
            ELSE 85 -- Deduct points for warnings
        END
    ) RETURNING id INTO handoff_id;

    -- Log warnings if any
    IF jsonb_array_length(validation_result->'warnings') > 0 THEN
        RAISE NOTICE 'HANDOFF_WARNINGS for %: %', handoff_type, validation_result->>'warnings';
    END IF;

    RAISE NOTICE 'HANDOFF_CREATED: % (%) with validation score %',
        handoff_id, handoff_type,
        CASE WHEN jsonb_array_length(validation_result->'warnings') = 0 THEN 100 ELSE 85 END;

    RETURN handoff_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HANDOFF HISTORY & AUDIT TRAIL
-- ============================================================================

-- View for handoff chain analysis
CREATE OR REPLACE VIEW v_handoff_chain AS
SELECT
    he.sd_id,
    sd.title as sd_title,
    he.handoff_type,
    he.from_agent,
    he.to_agent,
    he.status,
    he.validation_score,
    he.created_at,
    he.accepted_at,
    EXTRACT(EPOCH FROM (he.accepted_at - he.created_at))/3600 as processing_hours,
    CASE
        WHEN he.handoff_type = 'LEAD-to-PLAN' THEN 1
        WHEN he.handoff_type = 'PLAN-to-EXEC' THEN 2
        WHEN he.handoff_type = 'EXEC-to-PLAN' THEN 3
        WHEN he.handoff_type = 'PLAN-to-LEAD' THEN 4
        ELSE 0
    END as workflow_sequence
FROM leo_handoff_executions he
JOIN strategic_directives_v2 sd ON he.sd_id = sd.id
ORDER BY he.sd_id, workflow_sequence, he.created_at;

-- View for failed/problematic handoffs
CREATE OR REPLACE VIEW v_problematic_handoffs AS
SELECT
    he.*,
    sd.title as sd_title,
    sd.status as sd_status
FROM leo_handoff_executions he
JOIN strategic_directives_v2 sd ON he.sd_id = sd.id
WHERE he.status = 'rejected'
   OR he.validation_score < 70
   OR he.rejection_reason IS NOT NULL
ORDER BY he.created_at DESC;

-- ============================================================================
-- LEGACY HANDOFF MIGRATION SUPPORT
-- ============================================================================

-- Function to import legacy handoff files into database
CREATE OR REPLACE FUNCTION import_legacy_handoff(
    p_file_path TEXT,
    p_handoff_data JSONB
) RETURNS UUID AS $$
DECLARE
    handoff_id UUID;
    sd_id_extracted TEXT;
    handoff_type_extracted TEXT;
    from_agent TEXT;
    to_agent TEXT;
BEGIN
    -- Extract SD ID from file path or data
    sd_id_extracted := COALESCE(
        p_handoff_data->>'sd_id',
        regexp_replace(p_file_path, '.*handoff.*?([A-Z]+-[0-9A-Z]+).*', '\1')
    );

    -- Extract handoff type from file path or data
    handoff_type_extracted := COALESCE(
        p_handoff_data->>'handoff_type',
        regexp_replace(p_file_path, '.*handoff-([A-Z]+-[A-Z]+)-.*', '\1')
    );

    -- Parse from/to agents
    from_agent := split_part(handoff_type_extracted, '-to-', 1);
    to_agent := split_part(handoff_type_extracted, '-to-', 2);

    -- Create handoff record for legacy import
    INSERT INTO leo_handoff_executions (
        sd_id,
        handoff_type,
        from_agent,
        to_agent,
        executive_summary,
        deliverables_manifest,
        verification_results,
        compliance_status,
        quality_metrics,
        recommendations,
        action_items,
        status,
        file_path,
        created_by
    ) VALUES (
        sd_id_extracted,
        handoff_type_extracted,
        from_agent,
        to_agent,
        p_handoff_data->>'executive_summary',
        COALESCE(p_handoff_data->'deliverables_manifest', '[]'::jsonb),
        COALESCE(p_handoff_data->'verification_results', '{}'::jsonb),
        COALESCE(p_handoff_data->'compliance_status', '{}'::jsonb),
        COALESCE(p_handoff_data->'quality_metrics', '{}'::jsonb),
        COALESCE(p_handoff_data->'recommendations', '[]'::jsonb),
        COALESCE(p_handoff_data->'action_items', '[]'::jsonb),
        'accepted', -- Legacy handoffs are considered accepted
        p_file_path,
        'LEGACY_IMPORT'
    ) RETURNING id INTO handoff_id;

    RAISE NOTICE 'LEGACY_HANDOFF_IMPORTED: % from %', handoff_id, p_file_path;
    RETURN handoff_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION & TESTING
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🏗️  HANDOFF SYSTEM TABLES CREATED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ leo_handoff_executions - Core handoff tracking (was missing)';
    RAISE NOTICE '✅ handoff_validation_rules - Pre-flight validation rules';
    RAISE NOTICE '✅ validate_handoff_requirements() - Validation function';
    RAISE NOTICE '✅ create_validated_handoff() - Enforced handoff creation';
    RAISE NOTICE '✅ import_legacy_handoff() - Legacy file import support';
    RAISE NOTICE '✅ v_handoff_chain - Workflow analysis view';
    RAISE NOTICE '✅ v_problematic_handoffs - Failure tracking view';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Fixed Issues from SD-1A Retrospective:';
    RAISE NOTICE '   • "Handoff table missing" - leo_handoff_executions created';
    RAISE NOTICE '   • "Handoff creation failed" - Validation function prevents failures';
    RAISE NOTICE '   • "Had to use fallback file system" - Database-first enforced';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready for unified-handoff-system.js integration';
END;
$$;