-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T03:58:07.377Z
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- AFTER artifact (generated).
-- Source: this file is the BEFORE capture with ONLY the enumerated stamp lines inserted, produced
-- by scripts/one-off/gen-canonical-writer-stamp-amendments.mjs (exactly-once anchor matching).
-- Original source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see FR-4's description).
--
CREATE OR REPLACE FUNCTION public.update_sd_after_plan_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update SD status based on PLAN validation decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'validated'
            WHEN NEW.final_decision = 'REJECT' THEN 'technical_review_required'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'REDESIGN', 'RESEARCH') THEN 'plan_revision_required'
            ELSE status -- Keep current status for DEFER
        END,
        lifecycle_write_token = 'update_sd_after_plan_validation',
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$function$

