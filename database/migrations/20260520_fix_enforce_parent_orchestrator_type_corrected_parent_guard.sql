-- Migration: guard enforce_parent_orchestrator_type() against deliberately-corrected parents
-- SD-FDBK-GEN-FIX-TRG-ENFORCE-001 (closes harness_backlog 954df6ff)
--
-- PROBLEM
--   trg_enforce_parent_orchestrator_type fires AFTER UPDATE OF parent_sd_id on a CHILD and
--   issues a nested UPDATE forcing the PARENT to sd_type='orchestrator'. When the parent was
--   deliberately corrected away from 'orchestrator' (recorded in
--   governance_metadata.type_change_history), that nested UPDATE re-enters the parent's
--   BEFORE-UPDATE governance chain and is hard-blocked by detect_type_change_gaming()
--   (feature->orchestrator is an 85->70 threshold drop and the stored correction reason often
--   contains 'avoid'). Net effect: setting parent_sd_id on a child fails. RCA empirically
--   reproduced (rollback-only); 3 live SDs affected.
--
-- FIX (additive, Option B)
--   Add a guard so the cascade does NOT re-promote a parent that carries a type_change_history
--   entry with from='orchestrator'. This fixes the semantic defect at root (don't silently
--   re-promote a corrected parent on child attach) and leaves the five anti-gaming governance
--   triggers entirely untouched. The predicate only SUBTRACTS the parent UPDATE for corrected
--   parents; for every other parent the UPDATE proceeds exactly as before, so recursion is
--   strictly reduced and the 3 currently-blocked SDs auto-unblock with zero row mutation.
--
-- DATA CONTRACT
--   governance_metadata.type_change_history is a top-level JSONB ARRAY of
--   {from, to, reason, changed_at} (written by enforce_sd_type_change_explanation). The
--   jsonb_typeof(...) = 'array' guard defends against a future object-shaped writer so
--   jsonb_array_elements never raises SQLSTATE 22023.
--
-- SAFETY: CREATE OR REPLACE only — no DROP, idempotent, re-runnable. Rollback block below.

CREATE OR REPLACE FUNCTION public.enforce_parent_orchestrator_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.parent_sd_id IS NOT NULL THEN
    UPDATE strategic_directives_v2 AS p
    SET
      sd_type = 'orchestrator',
      updated_at = NOW()
    WHERE p.id = NEW.parent_sd_id
      AND p.sd_type != 'orchestrator'
      -- 4e2b5fa2: skip auto-promotion when the parent has already terminated.
      -- Avoids the enforce_type_change_timing block on completed parents and
      -- unblocks follow-up SD filing (CAPAs, regression children, etc.).
      AND p.status NOT IN ('completed', 'archived', 'cancelled')
      -- SD-FDBK-GEN-FIX-TRG-ENFORCE-001 (954df6ff): do NOT re-promote a parent that was
      -- deliberately corrected away from 'orchestrator'. Re-promoting would silently undo a
      -- governance decision and re-enter the parent's gaming-detection chain, hard-blocking
      -- the child's parent_sd_id write. type_change_history is a JSONB array; the jsonb_typeof
      -- guard keeps jsonb_array_elements from raising 22023 on a non-array value.
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(p.governance_metadata -> 'type_change_history') = 'array'
              THEN p.governance_metadata -> 'type_change_history'
            ELSE '[]'::jsonb
          END
        ) AS h
        WHERE h ->> 'from' = 'orchestrator'
      );
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- ROLLBACK (re-apply the prior function body verbatim; no DROP needed)
-- ============================================================================
-- CREATE OR REPLACE FUNCTION public.enforce_parent_orchestrator_type()
--  RETURNS trigger
--  LANGUAGE plpgsql
-- AS $function$
-- BEGIN
--   IF NEW.parent_sd_id IS NOT NULL THEN
--     UPDATE strategic_directives_v2
--     SET
--       sd_type = 'orchestrator',
--       updated_at = NOW()
--     WHERE id = NEW.parent_sd_id
--       AND sd_type != 'orchestrator'
--       AND status NOT IN ('completed', 'archived', 'cancelled');
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
