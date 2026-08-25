-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T22:22:58.529Z
-- SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-2 -- BEFORE artifact.
-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see the choke file's own section 4 provenance note).
--
CREATE OR REPLACE FUNCTION public.request_business_evaluation(p_sd_id text, p_rationale text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    UPDATE strategic_directives_v2
    SET
        status = 'pending_business_evaluation',
        current_phase = 'LEAD_BUSINESS_EVALUATION',
        updated_at = NOW()
    WHERE id = p_sd_id
      AND status = 'draft';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot move SD % to business evaluation. Must be in draft status.', p_sd_id;
    END IF;

    RAISE NOTICE 'SD % moved to business evaluation phase. LEAD must evaluate business value before any PLAN/EXEC work can begin.', p_sd_id;
    RETURN TRUE;
END;
$function$

