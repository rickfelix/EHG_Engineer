-- Migration: Require KR Alignment for New SDs (FIXED)
-- Purpose: Enforce that new Strategic Directives have at least one Key Result alignment
-- Author: Claude (OKR Strategic Hierarchy)
-- Date: 2026-01-04
-- Fix: Changed UUID types to VARCHAR to match actual schema

-- ============================================================================
-- 1. DROP EXISTING OBJECTS (if migration was partially applied)
-- ============================================================================
DROP VIEW IF EXISTS v_sd_alignment_warnings CASCADE;
DROP FUNCTION IF EXISTS check_sd_kr_alignment(UUID) CASCADE;
DROP FUNCTION IF EXISTS warn_on_sd_transition_without_kr() CASCADE;
DROP FUNCTION IF EXISTS check_lead_approval_kr_alignment(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS lead_preflight_kr_check(VARCHAR) CASCADE;
DROP TRIGGER IF EXISTS trigger_warn_sd_kr_alignment ON strategic_directives_v2;

-- ============================================================================
-- 2. CREATE WARNING VIEW FOR UNALIGNED SDs
-- ============================================================================
-- This view shows SDs that should have KR alignment but don't

CREATE OR REPLACE VIEW v_sd_alignment_warnings AS
SELECT
    sd.id,
    sd.legacy_id,
    sd.title,
    sd.status,
    sd.created_at,
    sd.priority,
    CASE
        WHEN sd.status IN ('draft', 'lead_review') THEN 'warning'
        WHEN sd.status IN ('plan_active', 'exec_active', 'active', 'in_progress') THEN 'critical'
        ELSE 'info'
    END as severity,
    'SD has no Key Result alignment' as message
FROM strategic_directives_v2 sd
LEFT JOIN sd_key_result_alignment ska ON sd.id = ska.sd_id
WHERE sd.is_active = TRUE
  AND sd.status NOT IN ('completed', 'cancelled', 'deferred')
  AND ska.id IS NULL
ORDER BY
    CASE
        WHEN sd.status IN ('plan_active', 'exec_active', 'active', 'in_progress') THEN 1
        WHEN sd.status IN ('draft', 'lead_review') THEN 2
        ELSE 3
    END,
    sd.created_at DESC;

-- ============================================================================
-- 3. CREATE VALIDATION FUNCTION (FIXED: VARCHAR instead of UUID)
-- ============================================================================
-- This function checks if an SD has KR alignment
-- Called by triggers and validation scripts

CREATE OR REPLACE FUNCTION check_sd_kr_alignment(p_sd_id VARCHAR)
RETURNS TABLE (
    is_aligned BOOLEAN,
    alignment_count INT,
    kr_codes TEXT[],
    warning_message TEXT
) AS $$
DECLARE
    v_count INT;
    v_codes TEXT[];
    v_status TEXT;
BEGIN
    -- Get alignment count and KR codes
    SELECT
        COUNT(*),
        ARRAY_AGG(kr.code)
    INTO v_count, v_codes
    FROM sd_key_result_alignment ska
    JOIN key_results kr ON ska.key_result_id = kr.id
    WHERE ska.sd_id = p_sd_id;

    -- Get SD status
    SELECT status INTO v_status
    FROM strategic_directives_v2
    WHERE id = p_sd_id;

    -- Return result
    RETURN QUERY SELECT
        v_count > 0 as is_aligned,
        v_count as alignment_count,
        COALESCE(v_codes, ARRAY[]::TEXT[]) as kr_codes,
        CASE
            WHEN v_count > 0 THEN NULL
            WHEN v_status IN ('draft', 'lead_review') THEN 'Warning: SD has no Key Result alignment. Consider aligning before advancing.'
            WHEN v_status IN ('plan_active', 'exec_active') THEN 'Critical: SD in active phase without Key Result alignment.'
            ELSE 'Info: SD should have Key Result alignment.'
        END as warning_message;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CREATE SOFT ENFORCEMENT TRIGGER
-- ============================================================================
-- This trigger warns (doesn't block) when SDs transition to active phases without alignment
-- To make it blocking, change RAISE NOTICE to RAISE EXCEPTION

CREATE OR REPLACE FUNCTION warn_on_sd_transition_without_kr()
RETURNS TRIGGER AS $$
DECLARE
    v_alignment_count INT;
    v_transition_to_active BOOLEAN;
BEGIN
    -- Check if transitioning to an active phase
    v_transition_to_active := (
        OLD.status NOT IN ('plan_active', 'exec_active', 'active', 'in_progress')
        AND NEW.status IN ('plan_active', 'exec_active', 'active', 'in_progress')
    );

    IF v_transition_to_active THEN
        -- Check alignment count
        SELECT COUNT(*) INTO v_alignment_count
        FROM sd_key_result_alignment
        WHERE sd_id = NEW.id;

        IF v_alignment_count = 0 THEN
            -- Log warning (change to RAISE EXCEPTION to block)
            RAISE NOTICE 'SD % is transitioning to % without Key Result alignment. Consider running: node scripts/align-sds-to-krs.js',
                NEW.legacy_id, NEW.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_warn_sd_kr_alignment'
    ) THEN
        CREATE TRIGGER trigger_warn_sd_kr_alignment
            BEFORE UPDATE OF status ON strategic_directives_v2
            FOR EACH ROW
            EXECUTE FUNCTION warn_on_sd_transition_without_kr();
    END IF;
END;
$$;

-- ============================================================================
-- 5. CREATE LEAD GATE CHECK FUNCTION
-- ============================================================================
-- This function is called during LEAD approval to check KR alignment

CREATE OR REPLACE FUNCTION check_lead_approval_kr_alignment(p_sd_id VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_sd_id VARCHAR;
    v_alignment_count INT;
    v_kr_codes TEXT[];
    v_result JSONB;
BEGIN
    -- Get SD id (support both id and legacy_id)
    SELECT id INTO v_sd_id
    FROM strategic_directives_v2
    WHERE id = p_sd_id OR legacy_id = p_sd_id
    LIMIT 1;

    IF v_sd_id IS NULL THEN
        RETURN jsonb_build_object(
            'passed', FALSE,
            'gate', 'KR_ALIGNMENT',
            'message', 'SD not found: ' || p_sd_id
        );
    END IF;

    -- Check alignment
    SELECT COUNT(*), ARRAY_AGG(kr.code)
    INTO v_alignment_count, v_kr_codes
    FROM sd_key_result_alignment ska
    JOIN key_results kr ON ska.key_result_id = kr.id
    WHERE ska.sd_id = v_sd_id;

    IF v_alignment_count = 0 THEN
        RETURN jsonb_build_object(
            'passed', FALSE,
            'gate', 'KR_ALIGNMENT',
            'severity', 'warning',
            'message', 'SD has no Key Result alignment. Recommend running alignment before approval.',
            'action', 'Run: node scripts/align-sds-to-krs.js or manually align via sd_key_result_alignment table'
        );
    END IF;

    RETURN jsonb_build_object(
        'passed', TRUE,
        'gate', 'KR_ALIGNMENT',
        'message', 'SD aligned to ' || v_alignment_count || ' Key Result(s): ' || array_to_string(v_kr_codes, ', '),
        'kr_count', v_alignment_count,
        'kr_codes', v_kr_codes
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. ADD TO LEAD APPROVAL CHECKLIST (if exists)
-- ============================================================================
-- Update the LEAD validation to include KR alignment check

-- This creates a convenience function for the LEAD phase preflight
CREATE OR REPLACE FUNCTION lead_preflight_kr_check(p_legacy_id VARCHAR)
RETURNS TABLE (
    check_name TEXT,
    passed BOOLEAN,
    severity TEXT,
    message TEXT
) AS $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := check_lead_approval_kr_alignment(p_legacy_id);

    RETURN QUERY SELECT
        'Key Result Alignment'::TEXT as check_name,
        (v_result->>'passed')::BOOLEAN as passed,
        COALESCE(v_result->>'severity', 'info')::TEXT as severity,
        (v_result->>'message')::TEXT as message;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. GRANTS
-- ============================================================================

GRANT SELECT ON v_sd_alignment_warnings TO authenticated;
GRANT SELECT ON v_sd_alignment_warnings TO service_role;
GRANT EXECUTE ON FUNCTION check_sd_kr_alignment(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION check_sd_kr_alignment(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION check_lead_approval_kr_alignment(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION check_lead_approval_kr_alignment(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION lead_preflight_kr_check(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION lead_preflight_kr_check(VARCHAR) TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds:
-- 1. v_sd_alignment_warnings - View showing SDs without KR alignment
-- 2. check_sd_kr_alignment() - Function to check alignment for an SD
-- 3. warn_on_sd_transition_without_kr() - Trigger that warns on transitions
-- 4. check_lead_approval_kr_alignment() - LEAD gate check function
-- 5. lead_preflight_kr_check() - Convenience function for preflight
--
-- To enable BLOCKING enforcement (instead of warnings):
-- 1. Edit warn_on_sd_transition_without_kr()
-- 2. Change "RAISE NOTICE" to "RAISE EXCEPTION"
