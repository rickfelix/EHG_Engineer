-- SD-LEO-FIX-GUARD-UNGUARDED-UUID-001 (F-9): add the non-blocking EXCEPTION guard to
-- try_auto_complete_parent_orchestrator.
--
-- Root cause (verified live via pg_get_functiondef 2026-07-01): the parent-orchestrator
-- auto-complete AFTER trigger has a bare BEGIN...END with NO EXCEPTION handler. It fires on
-- every child SD's transition to 'completed' and calls complete_orchestrator_sd(v_parent_id).
-- Any error raised inside that call chain (or the child-count SELECT) propagates and ABORTS
-- the child's own SD-completion UPDATE — a side-effect trigger blocking the completion write
-- it is only meant to observe. This is the same hazard the sibling completion-path triggers
-- were guarded against: fn_auto_close_feedback_on_sd_completion (20260621), and the
-- fn_auto_close_quick_fixes / fn_auto_close_deliverables pair already end with
-- `EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; RETURN NEW;`. Completion writes are sacred
-- (ROOT-FIX-TRG doctrine) — a side-effect trigger must never block them.
--
-- This migration CREATE OR REPLACEs the function with a BYTE-IDENTICAL body (reproduced verbatim
-- from the live definition) plus the sibling guard appended before the final END. The trigger
-- binding, signature, SECURITY DEFINER, and search_path are unchanged. Reversible via the _DOWN
-- migration.

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
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: log warning but never prevent the child SD's completion (parity with the sibling
  -- auto-close triggers; ROOT-FIX-TRG doctrine — completion writes are sacred). SD-LEO-FIX-GUARD-UNGUARDED-UUID-001 F-9.
  RAISE WARNING 'try_auto_complete_parent_orchestrator failed for SD %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- Self-verification: the re-created function now carries the outer EXCEPTION guard.
-- Fails the migration loudly if the guard is missing (e.g. a bad copy of the body).
-- ----------------------------------------------------------------------------
DO $verify$
BEGIN
  IF pg_get_functiondef('public.try_auto_complete_parent_orchestrator()'::regprocedure)
       NOT ILIKE '%EXCEPTION WHEN OTHERS THEN%' THEN
    RAISE EXCEPTION 'VERIFY FAILED: try_auto_complete_parent_orchestrator has no EXCEPTION guard';
  END IF;
  RAISE NOTICE 'VERIFY OK: try_auto_complete_parent_orchestrator re-created with non-blocking EXCEPTION guard';
END $verify$;
