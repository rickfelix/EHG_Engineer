-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T03:58:07.377Z
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- BEFORE artifact.
-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see FR-4's description).
--
CREATE OR REPLACE FUNCTION public.update_sd_after_lead_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update SD status based on LEAD decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'active'
            WHEN NEW.final_decision = 'REJECT' THEN 'rejected'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'CLARIFY') THEN 'pending_revision'
            ELSE status -- Keep current status for DEFER/CONSOLIDATE
        END,
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$function$

