-- =============================================================================
-- Migration: Quality-Checked Enforcement Triggers
-- Date: 2026-03-14
-- Purpose: Wire quality_checked boolean into status transitions so artifacts
--          cannot advance when quality is below standard.
--
-- Three enforcement mechanisms:
--   1. eva_vision_documents: Block UPDATE to status='active' or
--      chairman_approved=true when quality_checked=false
--   2. eva_architecture_plans: Same pattern as vision
--   3. strategic_directives_v2: Block phase transition past LEAD_APPROVAL
--      when quality_checked=false
--
-- Trigger naming convention ensures alphabetical ordering:
--   trg_auto_validate_*  (sets quality_checked)  fires FIRST
--   trg_enforce_*        (reads quality_checked)  fires SECOND
--
-- All enforcement triggers fire on UPDATE only (backward compatible with
-- INSERT flows where artifacts may start at any status).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vision Documents: Block advancement when quality_checked = false
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_vision_quality_on_advancement()
RETURNS TRIGGER AS $$
BEGIN
  -- Block status change to 'active' if quality not checked
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot set vision status to active: quality_checked is false. Vision content does not meet minimum quality thresholds. Check quality_issues for details. (vision_key: %)', NEW.vision_key;
  END IF;

  -- Block chairman approval if quality not checked
  IF NEW.chairman_approved = true AND OLD.chairman_approved = false AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot approve vision: quality_checked is false. Vision content does not meet minimum quality thresholds. Check quality_issues for details. (vision_key: %)', NEW.vision_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_vision_quality_on_advancement() IS
  'Prevents vision documents from advancing to active status or receiving chairman approval when quality_checked is false. '
  'Relies on trg_auto_validate_vision_quality firing first (alphabetical ordering) to set quality_checked.';

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_enforce_vision_quality_advancement ON eva_vision_documents;

CREATE TRIGGER trg_enforce_vision_quality_advancement
  BEFORE UPDATE ON eva_vision_documents
  FOR EACH ROW
  EXECUTE FUNCTION enforce_vision_quality_on_advancement();


-- ---------------------------------------------------------------------------
-- 2. Architecture Plans: Block advancement when quality_checked = false
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_archplan_quality_on_advancement()
RETURNS TRIGGER AS $$
BEGIN
  -- Block status change to 'active' if quality not checked
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot set architecture plan status to active: quality_checked is false. Architecture plan content does not meet minimum quality thresholds. Check quality_issues for details. (plan_key: %)', NEW.plan_key;
  END IF;

  -- Block chairman approval if quality not checked
  IF NEW.chairman_approved = true AND OLD.chairman_approved = false AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot approve architecture plan: quality_checked is false. Architecture plan content does not meet minimum quality thresholds. Check quality_issues for details. (plan_key: %)', NEW.plan_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_archplan_quality_on_advancement() IS
  'Prevents architecture plans from advancing to active status or receiving chairman approval when quality_checked is false. '
  'Relies on trg_auto_validate_archplan_quality firing first (alphabetical ordering) to set quality_checked.';

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_enforce_archplan_quality_advancement ON eva_architecture_plans;

CREATE TRIGGER trg_enforce_archplan_quality_advancement
  BEFORE UPDATE ON eva_architecture_plans
  FOR EACH ROW
  EXECUTE FUNCTION enforce_archplan_quality_on_advancement();


-- ---------------------------------------------------------------------------
-- 3. Strategic Directives: Block phase transition past LEAD_APPROVAL
--    when quality_checked = false
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_sd_quality_on_advancement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when current_phase is actually changing
  IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase THEN
    RETURN NEW;
  END IF;

  -- Block transition FROM LEAD_APPROVAL to any later phase
  -- Later phases: LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, PLAN_PRD,
  --               PLAN_VERIFICATION, EXEC, EXEC_COMPLETE, COMPLETED
  -- Allow transitions backward to LEAD or DRAFT (not blocked)
  IF OLD.current_phase = 'LEAD_APPROVAL'
     AND NEW.current_phase NOT IN ('LEAD_APPROVAL', 'LEAD', 'DRAFT', 'CANCELLED')
     AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot advance SD past LEAD_APPROVAL: quality_checked is false. SD content does not meet minimum quality thresholds. Check quality_issues for details. (sd_key: %)', NEW.sd_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_sd_quality_on_advancement() IS
  'Prevents strategic directives from advancing past LEAD_APPROVAL when quality_checked is false. '
  'Relies on trg_auto_validate_sd_content_quality firing first (alphabetical ordering) to set quality_checked. '
  'Allows backward transitions (to LEAD, DRAFT) and cancellation regardless of quality status.';

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_enforce_sd_quality_advancement ON strategic_directives_v2;

CREATE TRIGGER trg_enforce_sd_quality_advancement
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sd_quality_on_advancement();


-- =============================================================================
-- Rollback SQL (run manually if needed):
--
-- DROP TRIGGER IF EXISTS trg_enforce_vision_quality_advancement ON eva_vision_documents;
-- DROP TRIGGER IF EXISTS trg_enforce_archplan_quality_advancement ON eva_architecture_plans;
-- DROP TRIGGER IF EXISTS trg_enforce_sd_quality_advancement ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS enforce_vision_quality_on_advancement();
-- DROP FUNCTION IF EXISTS enforce_archplan_quality_on_advancement();
-- DROP FUNCTION IF EXISTS enforce_sd_quality_on_advancement();
-- =============================================================================
