-- 20260502_enforce_orchestrator_skip_terminal_parents.sql
--
-- Closes feedback row 4e2b5fa2 (filed 2026-05-02 by session ed6fcc61):
-- trg_enforce_parent_orchestrator_type fires AFTER INSERT on any child SD with
-- a non-NULL parent_sd_id. The trigger UPDATEs the parent
-- SET sd_type='orchestrator', which fires four BEFORE-UPDATE triggers on the
-- parent including enforce_type_change_timing — that one BLOCKS once
-- has_handoffs AND current_phase NOT IN (LEAD, DRAFT). Net effect: cannot
-- file ANY follow-up SD (CAPA, regression-recovery child, post-mortem-driven
-- enhancement) with parent_sd_id FK against a parent that has already
-- completed.
--
-- Witnessed parent SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 (status=completed,
-- current_phase=COMPLETED, sd_type=infrastructure — never auto-promoted to
-- orchestrator while it was still in active phases) — filing FR-D-prime
-- against it raised SD_TYPE_CHANGE_TIMING_BLOCKED.
--
-- Forward-only fix: extend the existing idempotency guard so the auto-promotion
-- also skips when the parent is already in a terminal status. There is no
-- value in promoting a finished parent to 'orchestrator' for a new follow-up
-- SD — its classification is historical, and enforce_type_change_timing is
-- correctly preventing post-completion sd_type drift.
--
-- All other behavior (the IF NEW.parent_sd_id IS NOT NULL guard, the existing
-- sd_type != 'orchestrator' guard, the SET / RETURN shape) is preserved
-- verbatim from the live function definition.

CREATE OR REPLACE FUNCTION public.enforce_parent_orchestrator_type()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.parent_sd_id IS NOT NULL THEN
    UPDATE strategic_directives_v2
    SET
      sd_type = 'orchestrator',
      updated_at = NOW()
    WHERE id = NEW.parent_sd_id
      AND sd_type != 'orchestrator'
      -- 4e2b5fa2: skip auto-promotion when the parent has already terminated.
      -- Avoids the enforce_type_change_timing block on completed parents and
      -- unblocks follow-up SD filing (CAPAs, regression children, etc.).
      AND status NOT IN ('completed', 'archived', 'cancelled');
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_parent_orchestrator_type() IS
'LEO Protocol Governance: Automatically sets sd_type=orchestrator for any SD
that becomes a parent (when another SD references it via parent_sd_id),
EXCEPT when the parent is already in a terminal status (completed/archived/
cancelled). Terminal-status parents have their sd_type frozen by
enforce_type_change_timing, and there is no operational reason to promote a
finished parent for a new follow-up child.

Updated 2026-05-02 (feedback row 4e2b5fa2) to skip terminal parents.
Original purpose preserved for active parents — see
20251227_enforce_orchestrator_type_for_parent_sds.sql.';
