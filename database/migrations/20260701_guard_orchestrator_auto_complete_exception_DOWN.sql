-- DOWN for SD-LEO-FIX-GUARD-UNGUARDED-UUID-001 (F-9): restore try_auto_complete_parent_orchestrator
-- to its prior (un-guarded) definition — a bare BEGIN...END with no EXCEPTION handler. Byte-identical
-- to the pre-migration live definition (pg_get_functiondef 2026-07-01). Reverting re-introduces the
-- hazard where an error inside complete_orchestrator_sd (or the child-count SELECT) aborts the child
-- SD's completion write; only run this to roll back.

CREATE OR REPLACE FUNCTION public.try_auto_complete_parent_orchestrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_id VARCHAR;
  v_is_orchestrator BOOLEAN;
  v_total_children INT;
  v_completed_children INT;
  v_result JSONB;
BEGIN
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  v_parent_id := NEW.parent_sd_id;
  IF v_parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_is_orchestrator := is_orchestrator_sd(v_parent_id);
  IF NOT v_is_orchestrator THEN
    RETURN NEW;
  END IF;
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_children, v_completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = v_parent_id;
  IF v_completed_children = v_total_children AND v_total_children > 0 THEN
    RAISE NOTICE 'FIX 4: All % children completed for parent %. Attempting auto-complete...',
      v_total_children, v_parent_id;
    v_result := complete_orchestrator_sd(v_parent_id);
    IF (v_result->>'success')::boolean THEN
      RAISE NOTICE 'FIX 4: Parent orchestrator % auto-completed successfully', v_parent_id;
    ELSE
      RAISE NOTICE 'FIX 4: Parent orchestrator % not auto-completed: %',
        v_parent_id, v_result->>'error';
    END IF;
  ELSE
    RAISE NOTICE 'FIX 4: Parent % has %/% children completed - waiting for all',
      v_parent_id, v_completed_children, v_total_children;
  END IF;
  RETURN NEW;
END;
$function$;
