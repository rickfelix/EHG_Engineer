-- 20260606_resolve_patterns_on_sd_complete.sql
-- SD-FDBK-ENH-ISSUE-PATTERNS-CLOSURE-001
-- @approved-by: codestreetlabs@gmail.com
--
-- Completion-side closure-loop for issue_patterns. Mirrors the cancel-side
-- trg_reset_patterns_on_sd_cancel / trg_fn_reset_patterns_on_sd_cancel /
-- reset_cancelled_sd_patterns(), but RESOLVES assigned patterns when an SD
-- reaches status='completed' (for ALL sources). This fixes the gap where
-- resolveLearningItems() (lead-final-approval/helpers.js) only resolves patterns
-- for metadata.source='learn_command' SDs, stranding auto_rca/retrospective
-- patterns as status='assigned' on completed SDs (invisible to v_patterns_with_decay,
-- which filters status='active').
--
-- Follow-up to SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (cancel-side class).
-- assigned_sd_id may hold EITHER the SD uuid OR the sd_key, so all matching uses
-- `assigned_sd_id IN (p_sd_id, p_sd_key)` (same approach as the cancel-side helper).
-- (In practice assigned_sd_id holds the uuid id — FK issue_patterns_assigned_sd_id_fkey
--  references strategic_directives_v2(id) — so the p_sd_id arm is the load-bearing
--  match; the p_sd_key arm is harmless defensive redundancy.)

-- ============================================================================
-- 1. Helper: resolve assigned patterns for one completed SD (returns count)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_completed_sd_patterns(p_sd_id text, p_sd_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH updated AS (
    UPDATE issue_patterns
    SET status = 'resolved',
        resolution_date = now(),
        resolution_notes = COALESCE(resolution_notes, '') ||
          CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
          'Auto-resolved: assigned SD ' || COALESCE(p_sd_key, p_sd_id) || ' reached completed (closure-loop)',
        updated_at = now()
    WHERE status = 'assigned'
      AND assigned_sd_id IS NOT NULL
      AND assigned_sd_id IN (p_sd_id, p_sd_key)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;

-- ============================================================================
-- 2. Trigger wrapper: exception-isolated so a failure NEVER blocks SD completion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_resolve_patterns_on_sd_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_resolved INTEGER;
BEGIN
  BEGIN
    v_resolved := resolve_completed_sd_patterns(NEW.id::text, NEW.sd_key);
    IF v_resolved > 0 THEN
      RAISE NOTICE 'closure-loop: resolved % assigned issue_pattern(s) for completed SD %',
        v_resolved, COALESCE(NEW.sd_key, NEW.id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Failure isolation: degrade to a warning; the SD stays completed.
    RAISE WARNING 'closure-loop: resolve_completed_sd_patterns failed for SD % (%): % — completion preserved',
      COALESCE(NEW.sd_key, ''), NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. Trigger: fire only on the not-completed -> completed transition
--    (AFTER UPDATE OF status, same shape as the cancel-side trigger)
-- ============================================================================
CREATE OR REPLACE TRIGGER trg_resolve_patterns_on_sd_complete
  AFTER UPDATE OF status ON public.strategic_directives_v2
  FOR EACH ROW
  WHEN (((NEW.status)::text = 'completed'::text) AND ((OLD.status)::text IS DISTINCT FROM 'completed'::text))
  EXECUTE FUNCTION public.trg_fn_resolve_patterns_on_sd_complete();

-- ============================================================================
-- 4. One-time reconcile of historical danglers (idempotent; re-run finds 0 rows)
-- ============================================================================

-- (a) Patterns assigned to ALREADY-completed SDs -> resolved (was 15)
UPDATE issue_patterns p
SET status = 'resolved',
    resolution_date = now(),
    resolution_notes = COALESCE(p.resolution_notes, '') ||
      CASE WHEN p.resolution_notes IS NOT NULL AND p.resolution_notes != '' THEN '; ' ELSE '' END ||
      'Auto-resolved (reconcile): owning SD already completed - closure-loop backfill (SD-FDBK-ENH-ISSUE-PATTERNS-CLOSURE-001)',
    updated_at = now()
FROM strategic_directives_v2 s
WHERE p.status = 'assigned'
  AND p.assigned_sd_id IS NOT NULL
  AND p.assigned_sd_id IN (s.id::text, s.sd_key)
  AND s.status = 'completed';

-- (b) Orphaned assignments with NULL assigned_sd_id -> active (was 9)
UPDATE issue_patterns
SET status = 'active',
    assignment_date = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_orphan_reset', jsonb_build_object(
        'reason', 'was status=assigned with NULL assigned_sd_id (no SD to key on)',
        'reset_by', 'SD-FDBK-ENH-ISSUE-PATTERNS-CLOSURE-001',
        'reset_at', now()
      )
    ),
    updated_at = now()
WHERE status = 'assigned'
  AND assigned_sd_id IS NULL;
