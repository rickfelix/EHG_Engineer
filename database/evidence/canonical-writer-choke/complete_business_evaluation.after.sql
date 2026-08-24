-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T22:22:58.512Z
-- SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-2 -- AFTER artifact (generated).
-- Source: this file is the BEFORE capture with ONLY the enumerated stamp line inserted, produced
-- by scripts/one-off/gen-canonical-writer-stamp-amendments-fr2.mjs (exactly-once anchor matching).
-- Original source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see the choke file's own section 4 provenance note).
--
CREATE OR REPLACE FUNCTION public.complete_business_evaluation(p_sd_id text, p_evaluation_result text, p_rationale text, p_business_problem text DEFAULT NULL::text, p_solution_value text DEFAULT NULL::text, p_duplication_risk text DEFAULT 'LOW'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_new_status TEXT;
BEGIN
    -- Insert business evaluation
    INSERT INTO sd_business_evaluations (
        sd_id,
        business_problem_statement,
        solution_value_proposition,
        duplication_risk,
        evaluation_result,
        evaluation_rationale
    ) VALUES (
        p_sd_id,
        p_business_problem,
        p_solution_value,
        p_duplication_risk,
        p_evaluation_result,
        p_rationale
    );

    -- Determine new status based on evaluation result
    CASE p_evaluation_result
        WHEN 'APPROVE' THEN v_new_status := 'business_approved';
        WHEN 'REJECT' THEN v_new_status := 'business_rejected';
        ELSE v_new_status := 'pending_business_evaluation'; -- CONDITIONAL, CLARIFY, etc.
    END CASE;

    -- Update SD status
    UPDATE strategic_directives_v2
    SET
        status = v_new_status,
        current_phase = CASE
            WHEN p_evaluation_result = 'APPROVE' THEN 'READY_FOR_PLAN'
            WHEN p_evaluation_result = 'REJECT' THEN 'REJECTED'
            ELSE 'LEAD_BUSINESS_EVALUATION'
        END,
        lifecycle_write_token = 'complete_business_evaluation',
        updated_at = NOW()
    WHERE id = p_sd_id;

    RAISE NOTICE 'Business evaluation completed for SD %: % - %', p_sd_id, p_evaluation_result, p_rationale;
    RETURN TRUE;
END;
$function$

