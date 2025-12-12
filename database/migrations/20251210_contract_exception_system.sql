-- ============================================================================
-- MIGRATION: Contract Exception System with Automatic Scrutiny
-- Created: 2025-12-10
-- Author: Claude Code
--
-- Purpose:
-- 1. Fix JSON array casting issue in validate_data_contract_compliance
-- 2. Add automatic contract exception mechanism with justification tracking
-- 3. Add scrutiny level for exceptions requiring additional review
--
-- The exception system:
-- - Records ALL exceptions with justifications
-- - Categorizes exceptions by type (scope_expansion, forbidden_operation_override, etc.)
-- - Assigns scrutiny levels (low, medium, high, critical)
-- - Requires approval for high/critical exceptions
-- - Maintains full audit trail
-- ============================================================================

-- ============================================================================
-- TABLE: sd_contract_exceptions
-- Purpose: Track all contract exceptions with full audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_contract_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL,
    contract_type VARCHAR(20) NOT NULL CHECK (contract_type IN ('data', 'ux')),

    -- Exception details
    exception_type VARCHAR(50) NOT NULL CHECK (exception_type IN (
        'scope_expansion',          -- Adding tables not in allowed_tables
        'forbidden_operation',      -- Using a forbidden operation
        'path_boundary',            -- Component outside allowed paths
        'column_addition',          -- Adding columns not in allowed_columns
        'schema_deviation',         -- Deviating from JSONB schema
        'cultural_style_override',  -- Attempting to override cultural design style
        'other'
    )),

    -- What was the violation?
    violation_details JSONB NOT NULL DEFAULT '{}',
    -- e.g., { "requested_table": "new_table", "allowed_tables": ["a", "b"] }

    -- Why is this exception needed?
    justification TEXT NOT NULL CHECK (length(justification) >= 50),

    -- Automatic scrutiny assessment
    scrutiny_level VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (scrutiny_level IN (
        'low',      -- Minor scope adjustment, auto-approved
        'medium',   -- Requires review in handoff notes
        'high',     -- Requires explicit chairman approval
        'critical'  -- Requires architect review + chairman approval
    )),

    -- Approval tracking
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN (
        'pending',      -- Awaiting approval
        'auto_approved', -- Auto-approved (low scrutiny)
        'approved',     -- Manually approved
        'rejected',     -- Rejected with reason
        'escalated'     -- Escalated for higher review
    )),
    approved_by VARCHAR(100),
    approval_justification TEXT,
    approved_at TIMESTAMPTZ,

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_contract_exceptions_sd ON sd_contract_exceptions(sd_id);
CREATE INDEX IF NOT EXISTS idx_contract_exceptions_status ON sd_contract_exceptions(approval_status);
CREATE INDEX IF NOT EXISTS idx_contract_exceptions_scrutiny ON sd_contract_exceptions(scrutiny_level);
CREATE INDEX IF NOT EXISTS idx_contract_exceptions_type ON sd_contract_exceptions(exception_type);

COMMENT ON TABLE sd_contract_exceptions IS
'Tracks all contract exceptions with full audit trail and automatic scrutiny assessment.
Each exception records the violation, justification, scrutiny level, and approval status.
This ensures transparency and governance for any contract boundary changes.';

-- ============================================================================
-- FUNCTION: request_contract_exception
-- Purpose: Request an exception with automatic scrutiny assessment
-- ============================================================================
CREATE OR REPLACE FUNCTION request_contract_exception(
    p_sd_id VARCHAR(50),
    p_contract_id UUID,
    p_contract_type VARCHAR(20),
    p_exception_type VARCHAR(50),
    p_violation_details JSONB,
    p_justification TEXT,
    p_created_by VARCHAR(100) DEFAULT 'claude-code'
)
RETURNS JSONB AS $$
DECLARE
    v_scrutiny_level VARCHAR(20);
    v_approval_status VARCHAR(20);
    v_exception_id UUID;
BEGIN
    -- Validate justification length
    IF length(p_justification) < 50 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Justification must be at least 50 characters explaining why this exception is necessary',
            'justification_length', length(p_justification)
        );
    END IF;

    -- Automatic scrutiny assessment based on exception type
    v_scrutiny_level := CASE p_exception_type
        -- Low scrutiny - auto-approve
        WHEN 'column_addition' THEN 'low'

        -- Medium scrutiny - review in handoff
        WHEN 'path_boundary' THEN 'medium'
        WHEN 'schema_deviation' THEN 'medium'

        -- High scrutiny - requires explicit approval
        WHEN 'scope_expansion' THEN 'high'
        WHEN 'forbidden_operation' THEN 'high'

        -- Critical - requires architect + chairman
        WHEN 'cultural_style_override' THEN 'critical'

        ELSE 'medium'
    END;

    -- Additional scrutiny adjustments based on violation details
    -- Multiple tables = higher scrutiny
    IF p_exception_type = 'scope_expansion' AND
       jsonb_array_length(COALESCE(p_violation_details->'requested_tables', '[]'::jsonb)) > 3 THEN
        v_scrutiny_level := 'critical';
    END IF;

    -- Auto-approve low scrutiny exceptions
    v_approval_status := CASE v_scrutiny_level
        WHEN 'low' THEN 'auto_approved'
        ELSE 'pending'
    END;

    -- Insert the exception request
    INSERT INTO sd_contract_exceptions (
        sd_id, contract_id, contract_type, exception_type,
        violation_details, justification, scrutiny_level,
        approval_status, created_by,
        approved_at, approval_justification
    ) VALUES (
        p_sd_id, p_contract_id, p_contract_type, p_exception_type,
        p_violation_details, p_justification, v_scrutiny_level,
        v_approval_status, p_created_by,
        CASE WHEN v_approval_status = 'auto_approved' THEN NOW() ELSE NULL END,
        CASE WHEN v_approval_status = 'auto_approved' THEN 'Auto-approved: Low scrutiny exception' ELSE NULL END
    )
    RETURNING id INTO v_exception_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'exception_id', v_exception_id,
        'scrutiny_level', v_scrutiny_level,
        'approval_status', v_approval_status,
        'requires_approval', v_approval_status != 'auto_approved',
        'message', CASE v_approval_status
            WHEN 'auto_approved' THEN 'Exception auto-approved (low scrutiny)'
            ELSE format('Exception requires %s-level approval', v_scrutiny_level)
        END
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: approve_contract_exception
-- Purpose: Approve or reject a pending exception
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_contract_exception(
    p_exception_id UUID,
    p_approved BOOLEAN,
    p_approval_justification TEXT,
    p_approved_by VARCHAR(100)
)
RETURNS JSONB AS $$
DECLARE
    v_exception RECORD;
BEGIN
    -- Get the exception
    SELECT * INTO v_exception FROM sd_contract_exceptions WHERE id = p_exception_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Exception not found');
    END IF;

    IF v_exception.approval_status NOT IN ('pending', 'escalated') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('Exception already %s', v_exception.approval_status)
        );
    END IF;

    -- Require justification for rejection
    IF NOT p_approved AND (p_approval_justification IS NULL OR length(p_approval_justification) < 20) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Rejection requires justification of at least 20 characters'
        );
    END IF;

    -- Update the exception
    UPDATE sd_contract_exceptions
    SET
        approval_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
        approved_by = p_approved_by,
        approval_justification = p_approval_justification,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_exception_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'exception_id', p_exception_id,
        'approval_status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
        'message', CASE WHEN p_approved
            THEN 'Exception approved - contract boundaries temporarily expanded'
            ELSE 'Exception rejected - original contract boundaries remain in effect'
        END
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: get_pending_exceptions
-- Purpose: Get all pending exceptions for an SD that need approval
-- ============================================================================
CREATE OR REPLACE FUNCTION get_pending_exceptions(p_sd_id VARCHAR(50))
RETURNS TABLE (
    exception_id UUID,
    contract_type VARCHAR(20),
    exception_type VARCHAR(50),
    scrutiny_level VARCHAR(20),
    violation_details JSONB,
    justification TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id AS exception_id,
        e.contract_type,
        e.exception_type,
        e.scrutiny_level,
        e.violation_details,
        e.justification,
        e.created_at
    FROM sd_contract_exceptions e
    WHERE e.sd_id = p_sd_id
      AND e.approval_status IN ('pending', 'escalated')
    ORDER BY
        CASE e.scrutiny_level
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
        END,
        e.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: check_exception_approved
-- Purpose: Check if an exception of a specific type is approved for an SD
-- ============================================================================
CREATE OR REPLACE FUNCTION check_exception_approved(
    p_sd_id VARCHAR(50),
    p_exception_type VARCHAR(50),
    p_details JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM sd_contract_exceptions
        WHERE sd_id = p_sd_id
          AND exception_type = p_exception_type
          AND approval_status IN ('approved', 'auto_approved')
          AND (p_details IS NULL OR violation_details @> p_details)
    ) INTO v_exists;

    RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIXED FUNCTION: validate_data_contract_compliance
-- Purpose: Validates PRD or migration content against data contract
-- FIXES:
-- 1. Proper JSONB array iteration (not TEXT[] casting)
-- 2. Integration with exception system
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
    v_allowed_tables TEXT[];
    v_forbidden_ops JSONB;
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

    -- FIX: Get forbidden_operations as JSONB, not TEXT[]
    v_forbidden_ops := v_contract.contract_data->'forbidden_operations';

    -- Check for forbidden operations (applies to migration content only)
    IF p_content_type = 'migration' AND v_forbidden_ops IS NOT NULL AND jsonb_array_length(v_forbidden_ops) > 0 THEN
        FOR v_forbidden_op IN SELECT jsonb_array_elements_text(v_forbidden_ops)
        LOOP
            IF p_content ~* v_forbidden_op THEN
                -- Check if there's an approved exception for this
                IF NOT check_exception_approved(p_sd_id, 'forbidden_operation',
                    jsonb_build_object('operation', v_forbidden_op)) THEN
                    v_violations := v_violations || jsonb_build_object(
                        'type', 'FORBIDDEN_OPERATION',
                        'severity', 'BLOCKER',
                        'message', format('Content contains forbidden operation: %s', v_forbidden_op),
                        'contract_id', v_contract.contract_id,
                        'can_request_exception', TRUE
                    );
                    v_is_valid := FALSE;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- ONLY check table references for migration content (actual SQL)
    -- PRD content is English text and will produce false positives
    IF p_content_type = 'migration' THEN
        -- FIX: Get allowed_tables as array properly from JSONB
        SELECT array_agg(elem)
        INTO v_allowed_tables
        FROM jsonb_array_elements_text(v_contract.contract_data->'allowed_tables') AS elem;

        -- Check table references against allowed_tables
        FOR v_table_name IN
            SELECT DISTINCT unnest(regexp_matches(p_content, '(?:FROM|JOIN|INTO|UPDATE|TABLE|ALTER TABLE|CREATE TABLE|DROP TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-z_][a-z0-9_]*)', 'gi'))
        LOOP
            v_table_name := lower(v_table_name);
            IF NOT (v_table_name = ANY(v_allowed_tables)) THEN
                -- Check if there's an approved exception for this table
                IF NOT check_exception_approved(p_sd_id, 'scope_expansion',
                    jsonb_build_object('requested_table', v_table_name)) THEN
                    v_violations := v_violations || jsonb_build_object(
                        'type', 'TABLE_BOUNDARY_VIOLATION',
                        'severity', 'BLOCKER',
                        'message', format('References table "%s" not in allowed_tables: %s',
                            v_table_name, array_to_string(v_allowed_tables, ', ')),
                        'contract_id', v_contract.contract_id,
                        'can_request_exception', TRUE
                    );
                    v_is_valid := FALSE;
                END IF;
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
Integrates with exception system - approved exceptions bypass violations.
Returns detailed violation information including severity levels.
BLOCKER violations prevent SD completion unless exception is approved.';

-- ============================================================================
-- FUNCTION: get_exception_summary
-- Purpose: Get a summary of all exceptions for an SD
-- ============================================================================
CREATE OR REPLACE FUNCTION get_exception_summary(p_sd_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    v_total INTEGER;
    v_approved INTEGER;
    v_pending INTEGER;
    v_rejected INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE approval_status IN ('approved', 'auto_approved')),
        COUNT(*) FILTER (WHERE approval_status IN ('pending', 'escalated')),
        COUNT(*) FILTER (WHERE approval_status = 'rejected')
    INTO v_total, v_approved, v_pending, v_rejected
    FROM sd_contract_exceptions
    WHERE sd_id = p_sd_id;

    RETURN jsonb_build_object(
        'total_exceptions', v_total,
        'approved', v_approved,
        'pending', v_pending,
        'rejected', v_rejected,
        'has_pending', v_pending > 0
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Contract Exception System Migration Complete ===';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - Table: sd_contract_exceptions';
    RAISE NOTICE '  - Function: request_contract_exception(sd_id, contract_id, type, details, justification)';
    RAISE NOTICE '  - Function: approve_contract_exception(exception_id, approved, justification, approver)';
    RAISE NOTICE '  - Function: get_pending_exceptions(sd_id)';
    RAISE NOTICE '  - Function: check_exception_approved(sd_id, type, details)';
    RAISE NOTICE '  - Function: get_exception_summary(sd_id)';
    RAISE NOTICE '';
    RAISE NOTICE 'Fixed:';
    RAISE NOTICE '  - validate_data_contract_compliance now uses proper JSONB array iteration';
    RAISE NOTICE '  - Integrates with exception system for approved bypass';
    RAISE NOTICE '';
    RAISE NOTICE 'Scrutiny Levels:';
    RAISE NOTICE '  - low: Auto-approved (column additions)';
    RAISE NOTICE '  - medium: Reviewed in handoff (path boundaries)';
    RAISE NOTICE '  - high: Requires explicit approval (scope expansion, forbidden ops)';
    RAISE NOTICE '  - critical: Requires architect + chairman (cultural style override)';
END $$;
