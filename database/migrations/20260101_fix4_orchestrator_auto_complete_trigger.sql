-- ============================================================================
-- Migration: Fix 4 - Auto-Complete Parent Orchestrator Trigger
-- ============================================================================
-- Issue: complete_orchestrator_sd() exists but requires manual invocation
-- Fix: Add trigger that fires when child SD completes, auto-completes parent
-- Date: 2026-01-01
-- Author: LEO Protocol Process Improvement
-- ============================================================================

BEGIN;

-- ============================================================================
-- FUNCTION: Check and auto-complete parent orchestrator
-- ============================================================================
-- Called when any SD status changes to 'completed'
-- Checks if parent exists, is orchestrator, and all siblings complete

CREATE OR REPLACE FUNCTION try_auto_complete_parent_orchestrator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id VARCHAR;
  v_is_orchestrator BOOLEAN;
  v_total_children INT;
  v_completed_children INT;
  v_result JSONB;
BEGIN
  -- Only trigger on status change TO 'completed'
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Only trigger if status actually changed
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Check if this SD has a parent
  v_parent_id := NEW.parent_sd_id;
  IF v_parent_id IS NULL THEN
    -- No parent, nothing to auto-complete
    RETURN NEW;
  END IF;

  -- Check if parent is an orchestrator (has children)
  v_is_orchestrator := is_orchestrator_sd(v_parent_id);
  IF NOT v_is_orchestrator THEN
    RETURN NEW;
  END IF;

  -- Count children completion status
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_children, v_completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = v_parent_id;

  -- If all children completed, try to auto-complete parent
  IF v_completed_children = v_total_children AND v_total_children > 0 THEN
    -- Log the attempt
    RAISE NOTICE 'FIX 4: All % children completed for parent %. Attempting auto-complete...',
      v_total_children, v_parent_id;

    -- Try to complete the orchestrator
    -- Note: complete_orchestrator_sd() also checks for retrospective
    v_result := complete_orchestrator_sd(v_parent_id);

    IF (v_result->>'success')::boolean THEN
      RAISE NOTICE 'FIX 4: Parent orchestrator % auto-completed successfully', v_parent_id;
    ELSE
      -- Non-fatal: log the issue but don't block child completion
      RAISE NOTICE 'FIX 4: Parent orchestrator % not auto-completed: %',
        v_parent_id, v_result->>'error';
    END IF;
  ELSE
    RAISE NOTICE 'FIX 4: Parent % has %/% children completed - waiting for all',
      v_parent_id, v_completed_children, v_total_children;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION try_auto_complete_parent_orchestrator() IS
'FIX 4 (2026-01-01): Auto-complete parent orchestrator when all children complete.
Trigger fires on child SD status change to completed.
Non-fatal if parent cannot complete (e.g., missing retrospective).';

-- ============================================================================
-- TRIGGER: Fire on child SD completion
-- ============================================================================

DROP TRIGGER IF EXISTS trg_auto_complete_parent_orchestrator ON strategic_directives_v2;

CREATE TRIGGER trg_auto_complete_parent_orchestrator
  AFTER UPDATE OF status ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION try_auto_complete_parent_orchestrator();

COMMENT ON TRIGGER trg_auto_complete_parent_orchestrator ON strategic_directives_v2 IS
'FIX 4: Auto-complete parent orchestrator when last child completes';

-- ============================================================================
-- VIEW: Monitor orchestrator completion readiness
-- ============================================================================

CREATE OR REPLACE VIEW v_orchestrator_completion_status AS
SELECT
  parent.id AS orchestrator_id,
  parent.title AS orchestrator_title,
  parent.status AS orchestrator_status,
  COUNT(child.id) AS total_children,
  COUNT(child.id) FILTER (WHERE child.status = 'completed') AS completed_children,
  COUNT(child.id) FILTER (WHERE child.status != 'completed') AS pending_children,
  CASE
    WHEN COUNT(child.id) = COUNT(child.id) FILTER (WHERE child.status = 'completed')
    THEN 'READY_FOR_AUTO_COMPLETE'
    ELSE 'WAITING_FOR_CHILDREN'
  END AS auto_complete_status,
  EXISTS (
    SELECT 1 FROM retrospectives r WHERE r.sd_id = parent.id
  ) AS has_retrospective
FROM strategic_directives_v2 parent
JOIN strategic_directives_v2 child ON child.parent_sd_id = parent.id
WHERE parent.sd_type = 'orchestrator' OR EXISTS (
  SELECT 1 FROM strategic_directives_v2 c2 WHERE c2.parent_sd_id = parent.id
)
GROUP BY parent.id, parent.title, parent.status
ORDER BY
  CASE WHEN parent.status = 'completed' THEN 1 ELSE 0 END,
  (COUNT(child.id) - COUNT(child.id) FILTER (WHERE child.status = 'completed')) ASC;

COMMENT ON VIEW v_orchestrator_completion_status IS
'Monitor orchestrator SDs and their child completion status.
Shows which orchestrators are ready for auto-completion.';

-- ============================================================================
-- FUNCTION: Manually trigger auto-complete for stuck orchestrators
-- ============================================================================

CREATE OR REPLACE FUNCTION retry_orchestrator_auto_complete(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Simply call the existing function
  v_result := complete_orchestrator_sd(sd_id_param);
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION retry_orchestrator_auto_complete(VARCHAR) IS
'Manually retry auto-completion for orchestrators that got stuck.
Use when trigger did not fire or retrospective was added after children completed.';

GRANT EXECUTE ON FUNCTION retry_orchestrator_auto_complete TO authenticated;
GRANT EXECUTE ON FUNCTION retry_orchestrator_auto_complete TO service_role;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   FIX 4: AUTO-COMPLETE PARENT ORCHESTRATOR TRIGGER                   ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'NEW BEHAVIOR:';
  RAISE NOTICE '  [X] When child SD status changes to ''completed''';
  RAISE NOTICE '  [X] Trigger checks if parent is orchestrator';
  RAISE NOTICE '  [X] If ALL siblings complete, auto-complete parent';
  RAISE NOTICE '  [X] Requires retrospective (non-fatal if missing)';
  RAISE NOTICE '';
  RAISE NOTICE 'MONITORING:';
  RAISE NOTICE '  SELECT * FROM v_orchestrator_completion_status;';
  RAISE NOTICE '';
  RAISE NOTICE 'MANUAL RETRY:';
  RAISE NOTICE '  SELECT retry_orchestrator_auto_complete(''SD-XXX'');';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_auto_complete_parent_orchestrator ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS try_auto_complete_parent_orchestrator();
-- DROP VIEW IF EXISTS v_orchestrator_completion_status;
-- DROP FUNCTION IF EXISTS retry_orchestrator_auto_complete(VARCHAR);
-- ============================================================================
