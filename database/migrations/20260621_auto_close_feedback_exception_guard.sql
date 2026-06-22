-- SD-REFILL-003T5I5M: add the non-blocking EXCEPTION guard to fn_auto_close_feedback_on_sd_completion.
--
-- Root cause (verified live via pg_get_functiondef 2026-06-21): the feedback auto-close trigger
-- function had a bare BEGIN...END with NO EXCEPTION handler, so any feedback-table constraint
-- failure during the auto-close UPDATE propagated and ABORTED the SD-completion transaction.
-- Its siblings (fn_auto_close_quick_fixes_on_sd_completion, fn_auto_close_deliverables) both end
-- with `EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; RETURN NEW;` — completion writes are sacred
-- (ROOT-FIX-TRG doctrine), and a side-effect trigger must never block them.
--
-- This migration CREATE OR REPLACEs the function with a BYTE-IDENTICAL body plus the sibling guard
-- appended. The trigger binding is unchanged. Reversible via the _DOWN migration.

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
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: log warning but never prevent SD completion (parity with the sibling
  -- auto-close triggers; ROOT-FIX-TRG doctrine — completion writes are sacred). SD-REFILL-003T5I5M.
  RAISE WARNING 'fn_auto_close_feedback_on_sd_completion failed for SD %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;
