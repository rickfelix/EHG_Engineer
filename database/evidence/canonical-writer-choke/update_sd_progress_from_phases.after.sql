-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T03:58:07.377Z
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- AFTER artifact (generated).
-- Source: this file is the BEFORE capture with ONLY the enumerated stamp lines inserted, produced
-- by scripts/one-off/gen-canonical-writer-stamp-amendments.mjs (exactly-once anchor matching).
-- Original source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see FR-4's description).
--
CREATE OR REPLACE FUNCTION public.update_sd_progress_from_phases()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update the SD's progress and current phase
    UPDATE strategic_directives_v2
    SET
        progress = calculate_sd_progress(NEW.sd_id),
        current_phase = (
            SELECT phase_name
            FROM sd_phase_tracking
            WHERE sd_id = NEW.sd_id AND is_complete = false
            ORDER BY
                CASE phase_name
                    WHEN 'LEAD_APPROVAL' THEN 1
                    WHEN 'PLAN_DESIGN' THEN 2
                    WHEN 'EXEC_IMPLEMENTATION' THEN 3
                    WHEN 'PLAN_VERIFICATION' THEN 4
                    WHEN 'LEAD_FINAL_APPROVAL' THEN 5
                END
            LIMIT 1
        ),
        lifecycle_write_token = 'update_sd_progress_from_phases',
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    -- Mark as completed if all phases are complete
    UPDATE strategic_directives_v2
    SET
        status = 'completed',
        completion_date = NOW(),
        lifecycle_write_token = 'update_sd_progress_from_phases'
    WHERE id = NEW.sd_id
    AND NOT EXISTS (
        SELECT 1 FROM sd_phase_tracking
        WHERE sd_id = NEW.sd_id AND is_complete = false
    )
    AND status != 'completed';

    RETURN NEW;
END;
$function$

