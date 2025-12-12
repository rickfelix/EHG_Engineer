-- ============================================================================
-- MIGRATION: Contract Validation Functions
-- Created: 2025-12-08
-- Author: Claude Code (Architecture Enhancement)
--
-- Purpose: Provides SQL functions for validating SD work against parent contracts.
--          These functions are called by sub-agents during PLAN and EXEC phases.
--
-- Functions:
--   - get_inherited_contracts(sd_id) - Returns all contracts in hierarchy
--   - validate_data_contract_compliance(sd_id, content_type, content)
--   - validate_ux_contract_compliance(sd_id, component_path)
--   - record_contract_violation(sd_id, contract_id, type, severity, message)
--   - get_unresolved_violations(sd_id) - Returns blocking violations
--   - override_violation(violation_id, justification, overridden_by)
--
-- Reference: /home/rickf/.claude/plans/zazzy-sparking-planet.md
-- ============================================================================

-- ============================================================================
-- FUNCTION: get_inherited_contracts(sd_id)
-- Purpose: Returns all contracts that apply to an SD (from entire parent chain)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_inherited_contracts(p_sd_id VARCHAR(50))
RETURNS TABLE (
    contract_id UUID,
    contract_type VARCHAR(20),
    parent_sd_id VARCHAR(50),
    contract_version INTEGER,
    contract_data JSONB
) AS $$
DECLARE
    v_current_sd VARCHAR(50);
    v_parent_sd VARCHAR(50);
BEGIN
    v_current_sd := p_sd_id;

    -- Walk up the parent chain
    LOOP
        -- Get parent of current SD
        SELECT s.parent_sd_id INTO v_parent_sd
        FROM strategic_directives_v2 s
        WHERE s.id = v_current_sd;

        -- Exit if no parent
        EXIT WHEN v_parent_sd IS NULL;

        -- Return data contracts from this parent
        RETURN QUERY
        SELECT
            dc.id AS contract_id,
            'data'::VARCHAR(20) AS contract_type,
            dc.parent_sd_id,
            dc.contract_version,
            jsonb_build_object(
                'allowed_tables', dc.allowed_tables,
                'allowed_columns', dc.allowed_columns,
                'forbidden_operations', dc.forbidden_operations,
                'jsonb_schemas', dc.jsonb_schemas,
                'column_types', dc.column_types,
                'description', dc.description
            ) AS contract_data
        FROM sd_data_contracts dc
        WHERE dc.parent_sd_id = v_parent_sd
        ORDER BY dc.contract_version DESC
        LIMIT 1;

        -- Return UX contracts from this parent
        RETURN QUERY
        SELECT
            uc.id AS contract_id,
            'ux'::VARCHAR(20) AS contract_type,
            uc.parent_sd_id,
            uc.contract_version,
            jsonb_build_object(
                'component_paths', uc.component_paths,
                'forbidden_paths', uc.forbidden_paths,
                'required_design_tokens', uc.required_design_tokens,
                'cultural_design_style', uc.cultural_design_style,
                'max_component_loc', uc.max_component_loc,
                'navigation_patterns', uc.navigation_patterns,
                'error_handling_pattern', uc.error_handling_pattern,
                'loading_state_pattern', uc.loading_state_pattern,
                'min_wcag_level', uc.min_wcag_level,
                'description', uc.description
            ) AS contract_data
        FROM sd_ux_contracts uc
        WHERE uc.parent_sd_id = v_parent_sd
        ORDER BY uc.contract_version DESC
        LIMIT 1;

        -- Move up the chain
        v_current_sd := v_parent_sd;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_inherited_contracts IS
'Returns all contracts that apply to an SD by walking up the parent chain.
Returns both data and UX contracts from each level of the hierarchy.';

-- ============================================================================
-- FUNCTION: validate_data_contract_compliance(sd_id, content_type, content)
-- Purpose: Validates PRD or migration content against data contract
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_data_contract_compliance(
    p_sd_id VARCHAR(50),
    p_content_type VARCHAR(20),  -- 'prd' or 'migration'
    p_content TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_contract RECORD;
    v_violations JSONB := '[]'::jsonb;
    v_table_name TEXT;
    v_forbidden_op TEXT;
    v_is_valid BOOLEAN := TRUE;
BEGIN
    -- Get the inherited data contract
    SELECT * INTO v_contract
    FROM get_inherited_contracts(p_sd_id)
    WHERE contract_type = 'data'
    ORDER BY contract_version DESC
    LIMIT 1;

    -- If no data contract, everything is allowed
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', TRUE,
            'message', 'No data contract found in parent hierarchy',
            'violations', '[]'::jsonb
        );
    END IF;

    -- Check for forbidden operations
    FOREACH v_forbidden_op IN ARRAY (v_contract.contract_data->>'forbidden_operations')::TEXT[]
    LOOP
        IF p_content ~* v_forbidden_op THEN
            v_violations := v_violations || jsonb_build_object(
                'type', 'FORBIDDEN_OPERATION',
                'severity', 'BLOCKER',
                'message', format('Content contains forbidden operation: %s', v_forbidden_op),
                'contract_id', v_contract.contract_id
            );
            v_is_valid := FALSE;
        END IF;
    END LOOP;

    -- Check table references against allowed_tables
    -- Extract table names from common SQL patterns
    FOR v_table_name IN
        SELECT DISTINCT unnest(regexp_matches(p_content, '(?:FROM|JOIN|INTO|UPDATE|TABLE|ALTER TABLE|CREATE TABLE|DROP TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-z_][a-z0-9_]*)', 'gi'))
    LOOP
        v_table_name := lower(v_table_name);
        IF NOT (v_table_name = ANY((v_contract.contract_data->>'allowed_tables')::TEXT[])) THEN
            v_violations := v_violations || jsonb_build_object(
                'type', 'TABLE_BOUNDARY_VIOLATION',
                'severity', 'BLOCKER',
                'message', format('References table "%s" not in allowed_tables: %s',
                    v_table_name, v_contract.contract_data->>'allowed_tables'),
                'contract_id', v_contract.contract_id
            );
            v_is_valid := FALSE;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'valid', v_is_valid,
        'contract_id', v_contract.contract_id,
        'contract_version', v_contract.contract_version,
        'parent_sd_id', v_contract.parent_sd_id,
        'violations', v_violations,
        'checked_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_data_contract_compliance IS
'Validates PRD or migration content against the inherited data contract.
Returns detailed violation information including severity levels.
BLOCKER violations prevent SD completion.';

-- ============================================================================
-- FUNCTION: validate_ux_contract_compliance(sd_id, component_path)
-- Purpose: Validates component path against UX contract boundaries
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_ux_contract_compliance(
    p_sd_id VARCHAR(50),
    p_component_path TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_contract RECORD;
    v_violations JSONB := '[]'::jsonb;
    v_is_valid BOOLEAN := TRUE;
    v_allowed_pattern TEXT;
    v_forbidden_pattern TEXT;
    v_path_allowed BOOLEAN := FALSE;
BEGIN
    -- Get the inherited UX contract
    SELECT * INTO v_contract
    FROM get_inherited_contracts(p_sd_id)
    WHERE contract_type = 'ux'
    ORDER BY contract_version DESC
    LIMIT 1;

    -- If no UX contract, everything is allowed
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', TRUE,
            'message', 'No UX contract found in parent hierarchy',
            'violations', '[]'::jsonb
        );
    END IF;

    -- Check if path matches any allowed pattern
    FOR v_allowed_pattern IN
        SELECT unnest((v_contract.contract_data->>'component_paths')::TEXT[])
    LOOP
        -- Convert glob pattern to regex (basic conversion)
        v_allowed_pattern := regexp_replace(v_allowed_pattern, '\*\*', '.*', 'g');
        v_allowed_pattern := regexp_replace(v_allowed_pattern, '\*', '[^/]*', 'g');
        v_allowed_pattern := '^' || v_allowed_pattern || '$';

        IF p_component_path ~ v_allowed_pattern THEN
            v_path_allowed := TRUE;
            EXIT;
        END IF;
    END LOOP;

    IF NOT v_path_allowed THEN
        v_violations := v_violations || jsonb_build_object(
            'type', 'PATH_BOUNDARY_VIOLATION',
            'severity', 'WARNING',  -- UX violations are warnings
            'message', format('Component path "%s" not in allowed paths: %s',
                p_component_path, v_contract.contract_data->>'component_paths'),
            'contract_id', v_contract.contract_id
        );
        v_is_valid := FALSE;
    END IF;

    -- Check against forbidden paths (even if allowed, forbidden takes precedence)
    IF v_contract.contract_data->>'forbidden_paths' IS NOT NULL THEN
        FOR v_forbidden_pattern IN
            SELECT unnest((v_contract.contract_data->>'forbidden_paths')::TEXT[])
        LOOP
            v_forbidden_pattern := regexp_replace(v_forbidden_pattern, '\*\*', '.*', 'g');
            v_forbidden_pattern := regexp_replace(v_forbidden_pattern, '\*', '[^/]*', 'g');
            v_forbidden_pattern := '^' || v_forbidden_pattern || '$';

            IF p_component_path ~ v_forbidden_pattern THEN
                v_violations := v_violations || jsonb_build_object(
                    'type', 'FORBIDDEN_PATH_VIOLATION',
                    'severity', 'WARNING',
                    'message', format('Component path "%s" matches forbidden pattern',
                        p_component_path),
                    'contract_id', v_contract.contract_id
                );
                v_is_valid := FALSE;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'valid', v_is_valid,
        'contract_id', v_contract.contract_id,
        'contract_version', v_contract.contract_version,
        'parent_sd_id', v_contract.parent_sd_id,
        'cultural_design_style', v_contract.contract_data->>'cultural_design_style',
        'max_component_loc', v_contract.contract_data->>'max_component_loc',
        'min_wcag_level', v_contract.contract_data->>'min_wcag_level',
        'violations', v_violations,
        'checked_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_ux_contract_compliance IS
'Validates component path against the inherited UX contract boundaries.
Also returns inherited cultural_design_style for design consistency checks.
UX violations are WARNINGs that can be overridden with justification.';

-- ============================================================================
-- FUNCTION: record_contract_violation(...)
-- Purpose: Records a contract violation for tracking and governance
-- ============================================================================
CREATE OR REPLACE FUNCTION record_contract_violation(
    p_sd_id VARCHAR(50),
    p_contract_id UUID,
    p_contract_type VARCHAR(20),
    p_violation_type VARCHAR(50),
    p_severity VARCHAR(20),
    p_message TEXT,
    p_context JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_violation_id UUID;
BEGIN
    INSERT INTO sd_contract_violations (
        sd_id,
        contract_id,
        contract_type,
        violation_type,
        severity,
        message,
        context
    ) VALUES (
        p_sd_id,
        p_contract_id,
        p_contract_type,
        p_violation_type,
        p_severity,
        p_message,
        p_context
    )
    RETURNING id INTO v_violation_id;

    RETURN v_violation_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_contract_violation IS
'Records a contract violation for tracking and governance audit.
Called by sub-agents when they detect violations during validation.';

-- ============================================================================
-- FUNCTION: get_unresolved_violations(sd_id)
-- Purpose: Returns all unresolved violations that could block SD completion
-- ============================================================================
CREATE OR REPLACE FUNCTION get_unresolved_violations(p_sd_id VARCHAR(50))
RETURNS TABLE (
    violation_id UUID,
    contract_type VARCHAR(20),
    violation_type VARCHAR(50),
    severity VARCHAR(20),
    message TEXT,
    context JSONB,
    created_at TIMESTAMPTZ,
    can_override BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id AS violation_id,
        v.contract_type,
        v.violation_type,
        v.severity,
        v.message,
        v.context,
        v.created_at,
        (v.severity = 'WARNING') AS can_override  -- Only WARNINGs can be overridden
    FROM sd_contract_violations v
    WHERE v.sd_id = p_sd_id
      AND v.overridden = FALSE
    ORDER BY
        CASE v.severity WHEN 'BLOCKER' THEN 1 ELSE 2 END,
        v.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unresolved_violations IS
'Returns all unresolved contract violations for an SD.
BLOCKERs cannot be overridden and prevent SD completion.
WARNINGs can be overridden with documented justification.';

-- ============================================================================
-- FUNCTION: override_violation(violation_id, justification, overridden_by)
-- Purpose: Override a WARNING-level violation with justification
-- ============================================================================
CREATE OR REPLACE FUNCTION override_violation(
    p_violation_id UUID,
    p_justification TEXT,
    p_overridden_by VARCHAR(100)
)
RETURNS JSONB AS $$
DECLARE
    v_violation RECORD;
BEGIN
    -- Get the violation
    SELECT * INTO v_violation
    FROM sd_contract_violations
    WHERE id = p_violation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Violation not found'
        );
    END IF;

    -- Cannot override BLOCKERs
    IF v_violation.severity = 'BLOCKER' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'BLOCKER violations cannot be overridden. Fix the underlying issue.'
        );
    END IF;

    -- Already overridden
    IF v_violation.overridden THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Violation already overridden',
            'overridden_at', v_violation.overridden_at,
            'overridden_by', v_violation.overridden_by
        );
    END IF;

    -- Require justification
    IF p_justification IS NULL OR length(trim(p_justification)) < 20 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Override justification must be at least 20 characters'
        );
    END IF;

    -- Apply override
    UPDATE sd_contract_violations
    SET
        overridden = TRUE,
        override_justification = p_justification,
        overridden_by = p_overridden_by,
        overridden_at = NOW()
    WHERE id = p_violation_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'violation_id', p_violation_id,
        'message', 'Violation overridden with justification',
        'overridden_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION override_violation IS
'Overrides a WARNING-level violation with documented justification.
BLOCKER violations cannot be overridden.
Requires at least 20 characters of justification.';

-- ============================================================================
-- FUNCTION: check_sd_can_complete(sd_id)
-- Purpose: Checks if an SD has any blocking violations preventing completion
-- ============================================================================
CREATE OR REPLACE FUNCTION check_sd_can_complete(p_sd_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    v_blocker_count INTEGER;
    v_warning_count INTEGER;
    v_blockers JSONB;
BEGIN
    -- Count blockers
    SELECT COUNT(*), jsonb_agg(jsonb_build_object(
        'violation_id', id,
        'type', violation_type,
        'message', message
    ))
    INTO v_blocker_count, v_blockers
    FROM sd_contract_violations
    WHERE sd_id = p_sd_id
      AND severity = 'BLOCKER'
      AND overridden = FALSE;

    -- Count unresolved warnings
    SELECT COUNT(*)
    INTO v_warning_count
    FROM sd_contract_violations
    WHERE sd_id = p_sd_id
      AND severity = 'WARNING'
      AND overridden = FALSE;

    IF v_blocker_count > 0 THEN
        RETURN jsonb_build_object(
            'can_complete', FALSE,
            'reason', format('%s BLOCKER violation(s) must be resolved', v_blocker_count),
            'blockers', COALESCE(v_blockers, '[]'::jsonb),
            'unresolved_warnings', v_warning_count
        );
    END IF;

    IF v_warning_count > 0 THEN
        RETURN jsonb_build_object(
            'can_complete', TRUE,
            'reason', format('%s WARNING(s) exist but can be overridden', v_warning_count),
            'blockers', '[]'::jsonb,
            'unresolved_warnings', v_warning_count
        );
    END IF;

    RETURN jsonb_build_object(
        'can_complete', TRUE,
        'reason', 'No contract violations',
        'blockers', '[]'::jsonb,
        'unresolved_warnings', 0
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_sd_can_complete IS
'Checks if an SD can be completed based on contract violations.
Returns FALSE if any BLOCKER violations exist.
Returns TRUE with warnings if only WARNING violations exist.';

-- ============================================================================
-- FUNCTION: get_contract_summary(sd_id)
-- Purpose: Returns a summary of all contracts and their status for an SD
-- ============================================================================
CREATE OR REPLACE FUNCTION get_contract_summary(p_sd_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    v_contracts JSONB;
    v_violations JSONB;
    v_sd_metadata JSONB;
BEGIN
    -- Get SD metadata
    SELECT metadata INTO v_sd_metadata
    FROM strategic_directives_v2
    WHERE id = p_sd_id;

    -- Get all inherited contracts
    SELECT jsonb_agg(jsonb_build_object(
        'contract_id', contract_id,
        'contract_type', contract_type,
        'parent_sd_id', parent_sd_id,
        'version', contract_version
    ))
    INTO v_contracts
    FROM get_inherited_contracts(p_sd_id);

    -- Get all violations
    SELECT jsonb_agg(jsonb_build_object(
        'violation_id', violation_id,
        'contract_type', contract_type,
        'violation_type', violation_type,
        'severity', severity,
        'message', message,
        'can_override', can_override
    ))
    INTO v_violations
    FROM get_unresolved_violations(p_sd_id);

    RETURN jsonb_build_object(
        'sd_id', p_sd_id,
        'contract_governed', COALESCE(v_sd_metadata->>'contract_governed', 'false'),
        'cultural_design_style', v_sd_metadata->>'cultural_design_style',
        'inherited_data_contract_id', v_sd_metadata->>'inherited_data_contract_id',
        'inherited_ux_contract_id', v_sd_metadata->>'inherited_ux_contract_id',
        'contracts', COALESCE(v_contracts, '[]'::jsonb),
        'violations', COALESCE(v_violations, '[]'::jsonb),
        'can_complete', (SELECT (check_sd_can_complete(p_sd_id))->>'can_complete')
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_contract_summary IS
'Returns a comprehensive summary of an SD''s contract status including:
- Inherited contracts from parent chain
- Current violations
- Whether the SD can be completed';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Contract Validation Functions Migration Complete ===';
    RAISE NOTICE 'Created functions:';
    RAISE NOTICE '  - get_inherited_contracts(sd_id)';
    RAISE NOTICE '  - validate_data_contract_compliance(sd_id, content_type, content)';
    RAISE NOTICE '  - validate_ux_contract_compliance(sd_id, component_path)';
    RAISE NOTICE '  - record_contract_violation(...)';
    RAISE NOTICE '  - get_unresolved_violations(sd_id)';
    RAISE NOTICE '  - override_violation(violation_id, justification, overridden_by)';
    RAISE NOTICE '  - check_sd_can_complete(sd_id)';
    RAISE NOTICE '  - get_contract_summary(sd_id)';
    RAISE NOTICE '';
    RAISE NOTICE 'Usage from sub-agents:';
    RAISE NOTICE '  1. PLAN: SELECT validate_data_contract_compliance(sd_id, ''prd'', prd_content)';
    RAISE NOTICE '  2. DATABASE: SELECT validate_data_contract_compliance(sd_id, ''migration'', migration_sql)';
    RAISE NOTICE '  3. DESIGN: SELECT validate_ux_contract_compliance(sd_id, component_path)';
    RAISE NOTICE '  4. COMPLETION: SELECT check_sd_can_complete(sd_id)';
END $$;
