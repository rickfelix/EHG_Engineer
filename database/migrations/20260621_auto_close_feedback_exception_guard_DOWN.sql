-- DOWN for SD-REFILL-003T5I5M: restore fn_auto_close_feedback_on_sd_completion to its prior
-- (un-guarded) definition — a bare BEGIN...END with no EXCEPTION handler. Byte-identical to the
-- pre-migration live definition (pg_get_functiondef 2026-06-21). Reverting re-introduces the
-- hazard where a feedback-table failure aborts SD completion; only run this to roll back.

CREATE OR REPLACE FUNCTION public.fn_auto_close_feedback_on_sd_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Only fire when SD transitions TO completed status
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Close all feedback linked via strategic_directive_id FK
    UPDATE feedback
    SET
      status = 'resolved',
      resolution_type = 'sd_completed',
      resolution_notes = COALESCE(resolution_notes, '') ||
        CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
        'Auto-resolved: linked SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' completed',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE strategic_directive_id = NEW.id
      AND status NOT IN ('resolved', 'wont_fix', 'shipped');

    -- Also close feedback linked via resolution_sd_id (legacy linkage)
    UPDATE feedback
    SET
      status = 'resolved',
      resolution_type = 'sd_completed',
      resolution_notes = COALESCE(resolution_notes, '') ||
        CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
        'Auto-resolved: linked SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' completed',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE resolution_sd_id = NEW.id
      AND status NOT IN ('resolved', 'wont_fix', 'shipped');
  END IF;

  RETURN NEW;
END;
$function$;
