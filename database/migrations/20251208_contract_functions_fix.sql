-- ============================================================================
-- MIGRATION: Fix Contract Validation Functions
-- Created: 2025-12-08
-- Author: Claude Code (Architecture Enhancement)
--
-- Purpose: Fixes array parsing issues in validation functions and adds
--          a function to manually re-inherit contracts for existing children.
-- ============================================================================

-- ============================================================================
-- FIX: validate_data_contract_compliance
-- Issue: Array parsing from JSONB was failing
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
    v_forbidden_ops TEXT[];
    v_allowed_tables TEXT[];
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

    -- Get forbidden operations from the data contract table directly
    SELECT dc.forbidden_operations, dc.allowed_tables
    INTO v_forbidden_ops, v_allowed_tables
    FROM sd_data_contracts dc
    WHERE dc.id = v_contract.contract_id;

    -- Check for forbidden operations
    IF v_forbidden_ops IS NOT NULL THEN
        FOREACH v_forbidden_op IN ARRAY v_forbidden_ops
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
    END IF;

    -- Check table references against allowed_tables
    -- Extract table names from common SQL patterns
    FOR v_table_name IN
        SELECT DISTINCT lower(m[1])
        FROM regexp_matches(p_content, '(?:FROM|JOIN|INTO|UPDATE|TABLE|ALTER TABLE|CREATE TABLE|DROP TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-z_][a-z0-9_]*)', 'gi') AS m
    LOOP
        IF v_allowed_tables IS NOT NULL AND NOT (v_table_name = ANY(v_allowed_tables)) THEN
            v_violations := v_violations || jsonb_build_object(
                'type', 'TABLE_BOUNDARY_VIOLATION',
                'severity', 'BLOCKER',
                'message', format('References table "%s" not in allowed_tables: %s',
                    v_table_name, array_to_string(v_allowed_tables, ', ')),
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

-- ============================================================================
-- FIX: validate_ux_contract_compliance
-- Issue: JSONB array access and glob pattern matching
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_ux_contract_compliance(
    p_sd_id VARCHAR(50),
    p_component_path TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_contract RECORD;
    v_ux_contract RECORD;
    v_violations JSONB := '[]'::jsonb;
    v_is_valid BOOLEAN := TRUE;
    v_allowed_pattern TEXT;
    v_forbidden_pattern TEXT;
    v_path_allowed BOOLEAN := FALSE;
    v_regex_pattern TEXT;
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

    -- Get the actual UX contract record for proper array access
    SELECT * INTO v_ux_contract
    FROM sd_ux_contracts
    WHERE id = v_contract.contract_id;

    -- Check if path matches any allowed pattern
    IF v_ux_contract.component_paths IS NOT NULL THEN
        FOREACH v_allowed_pattern IN ARRAY v_ux_contract.component_paths
        LOOP
            -- Convert glob pattern to regex
            v_regex_pattern := v_allowed_pattern;
            v_regex_pattern := regexp_replace(v_regex_pattern, '\*\*', '<<<DOUBLESTAR>>>', 'g');
            v_regex_pattern := regexp_replace(v_regex_pattern, '\*', '[^/]*', 'g');
            v_regex_pattern := regexp_replace(v_regex_pattern, '<<<DOUBLESTAR>>>', '.*', 'g');
            v_regex_pattern := '^' || v_regex_pattern || '$';

            IF p_component_path ~ v_regex_pattern THEN
                v_path_allowed := TRUE;
                EXIT;
            END IF;
        END LOOP;
    ELSE
        -- No paths specified means all paths allowed
        v_path_allowed := TRUE;
    END IF;

    IF NOT v_path_allowed THEN
        v_violations := v_violations || jsonb_build_object(
            'type', 'PATH_BOUNDARY_VIOLATION',
            'severity', 'WARNING',
            'message', format('Component path "%s" not in allowed paths: %s',
                p_component_path, array_to_string(v_ux_contract.component_paths, ', ')),
            'contract_id', v_contract.contract_id
        );
        v_is_valid := FALSE;
    END IF;

    -- Check against forbidden paths (even if allowed, forbidden takes precedence)
    IF v_ux_contract.forbidden_paths IS NOT NULL THEN
        FOREACH v_forbidden_pattern IN ARRAY v_ux_contract.forbidden_paths
        LOOP
            v_regex_pattern := v_forbidden_pattern;
            v_regex_pattern := regexp_replace(v_regex_pattern, '\*\*', '<<<DOUBLESTAR>>>', 'g');
            v_regex_pattern := regexp_replace(v_regex_pattern, '\*', '[^/]*', 'g');
            v_regex_pattern := regexp_replace(v_regex_pattern, '<<<DOUBLESTAR>>>', '.*', 'g');
            v_regex_pattern := '^' || v_regex_pattern || '$';

            IF p_component_path ~ v_regex_pattern THEN
                v_violations := v_violations || jsonb_build_object(
                    'type', 'FORBIDDEN_PATH_VIOLATION',
                    'severity', 'WARNING',
                    'message', format('Component path "%s" matches forbidden pattern: %s',
                        p_component_path, v_forbidden_pattern),
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
        'cultural_design_style', v_ux_contract.cultural_design_style,
        'max_component_loc', v_ux_contract.max_component_loc,
        'min_wcag_level', v_ux_contract.min_wcag_level,
        'violations', v_violations,
        'checked_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NEW FUNCTION: reinherit_contracts_for_children(parent_sd_id)
-- Purpose: Manually re-inherit contracts for all existing children of a parent
-- ============================================================================
CREATE OR REPLACE FUNCTION reinherit_contracts_for_children(p_parent_sd_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    v_child RECORD;
    v_data_contract RECORD;
    v_ux_contract RECORD;
    v_updated_count INTEGER := 0;
    v_parent_chain TEXT[];
    v_current_parent VARCHAR(50);
BEGIN
    -- Get parent's contracts
    SELECT * INTO v_data_contract
    FROM sd_data_contracts
    WHERE parent_sd_id = p_parent_sd_id
    ORDER BY contract_version DESC
    LIMIT 1;

    SELECT * INTO v_ux_contract
    FROM sd_ux_contracts
    WHERE parent_sd_id = p_parent_sd_id
    ORDER BY contract_version DESC
    LIMIT 1;

    -- Build parent chain
    v_parent_chain := ARRAY[p_parent_sd_id];
    v_current_parent := p_parent_sd_id;
    LOOP
        SELECT parent_sd_id INTO v_current_parent
        FROM strategic_directives_v2
        WHERE id = v_current_parent;

        EXIT WHEN v_current_parent IS NULL;
        v_parent_chain := array_append(v_parent_chain, v_current_parent);
    END LOOP;

    -- Update all children
    FOR v_child IN
        SELECT id, metadata
        FROM strategic_directives_v2
        WHERE parent_sd_id = p_parent_sd_id
    LOOP
        UPDATE strategic_directives_v2
        SET metadata = jsonb_strip_nulls(jsonb_build_object(
            'contract_governed', TRUE,
            'contract_parent_chain', v_parent_chain,
            'inherited_data_contract_id', v_data_contract.id,
            'data_contract_version', v_data_contract.contract_version,
            'inherited_ux_contract_id', v_ux_contract.id,
            'ux_contract_version', v_ux_contract.contract_version,
            'cultural_design_style', v_ux_contract.cultural_design_style,
            'cultural_design_style_source', 'inherited_from_' || p_parent_sd_id,
            'min_wcag_level', v_ux_contract.min_wcag_level
        ) || COALESCE(metadata, '{}'))
        WHERE id = v_child.id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'parent_sd_id', p_parent_sd_id,
        'children_updated', v_updated_count,
        'data_contract_id', v_data_contract.id,
        'ux_contract_id', v_ux_contract.id,
        'cultural_design_style', v_ux_contract.cultural_design_style
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reinherit_contracts_for_children IS
'Manually re-inherits contracts for all existing children of a parent SD.
Use this after creating/updating contracts for a parent that already has children.
The automatic trigger only fires on INSERT or when parent_sd_id changes.';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Contract Functions Fix Migration Complete ===';
    RAISE NOTICE 'Fixed: validate_data_contract_compliance (array parsing)';
    RAISE NOTICE 'Fixed: validate_ux_contract_compliance (glob pattern matching)';
    RAISE NOTICE 'Added: reinherit_contracts_for_children(parent_sd_id)';
END $$;
