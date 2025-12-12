-- ============================================================================
-- MIGRATION: Fix Contract Validation for PRD Content
-- Created: 2025-12-10
-- Author: Claude Code (Bug Fix)
--
-- Purpose: The validate_data_contract_compliance function was incorrectly
--          extracting table names from PRD content (English text) using SQL
--          regex patterns. This caused false positives like:
--            - "build from scratch" matched as table "scratch"
--            - "TABLE validation" matched as table "validated"
--
-- Fix: Only apply table extraction for 'migration' content type.
--      For 'prd' content type, only check for forbidden operations.
-- ============================================================================

-- ============================================================================
-- FUNCTION: validate_data_contract_compliance(sd_id, content_type, content)
-- Purpose: Validates PRD or migration content against data contract
-- FIX: Only extract table names from migration content, not PRD text
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

    -- Check for forbidden operations (applies to all content types)
    IF v_contract.contract_data->>'forbidden_operations' IS NOT NULL THEN
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
    END IF;

    -- ONLY check table references for migration content (actual SQL)
    -- PRD content is English text and will produce false positives
    IF p_content_type = 'migration' THEN
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
    END IF;

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
For PRD content: Only checks for forbidden operations (no table extraction from text).
For migration content: Checks both forbidden operations AND table boundaries.
Returns detailed violation information including severity levels.
BLOCKER violations prevent SD completion.';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Contract Validation PRD Fix Migration Complete ===';
    RAISE NOTICE 'Fixed: Table name extraction now only runs for migration content type';
    RAISE NOTICE 'PRD content only checks for forbidden operations';
    RAISE NOTICE 'This prevents false positives like "scratch" from "build from scratch"';
END $$;
