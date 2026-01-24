-- Migration: Relax Child SD Creation Timing
-- Date: 2026-01-24
-- Purpose: Allow child SDs to be created as drafts alongside parent in LEAD phase
--
-- RATIONALE:
-- The previous constraint (children only after parent reaches PLAN) was problematic:
-- 1. You need to see children to evaluate the orchestrator scope
-- 2. The breakdown into children IS part of defining the work
-- 3. LEAD approval should see the full structure (parent + children)
-- 4. Draft children alongside draft parent makes sense for planning visibility
--
-- NEW RULE:
-- - Children can be created when parent is in LEAD_APPROVAL, PLAN, or EXEC
-- - Children must start as 'draft' status when parent is in LEAD_APPROVAL
-- - Children cannot start EXEC until parent completes LEAD approval
--
-- This enables the workflow:
-- 1. Create orchestrator + children together as draft structure
-- 2. LEAD approves the whole thing (orchestrator + child breakdown)
-- 3. Move to PLAN, children proceed through their own workflows

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trg_enforce_child_creation_timing ON strategic_directives_v2;
DROP FUNCTION IF EXISTS enforce_child_creation_timing();

-- Create the updated enforcement function
CREATE OR REPLACE FUNCTION enforce_child_creation_timing()
RETURNS TRIGGER AS $$
DECLARE
  parent_phase TEXT;
  parent_status TEXT;
  parent_title TEXT;
BEGIN
  -- Only check for child SDs (has parent_sd_id)
  IF NEW.parent_sd_id IS NOT NULL AND NEW.relationship_type = 'child' THEN
    -- Get parent's current phase and status
    SELECT current_phase, status, title
    INTO parent_phase, parent_status, parent_title
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    -- If parent not found, allow (might be a data migration)
    IF parent_phase IS NULL THEN
      RETURN NEW;
    END IF;

    -- RELAXED RULE: Allow child creation in LEAD_APPROVAL, PLAN, or EXEC phases
    -- (Previously only allowed PLAN, EXEC)
    IF parent_phase NOT IN ('LEAD_APPROVAL', 'PLAN', 'PLAN_PRD', 'PLAN_VERIFY', 'EXEC', 'EXEC_IMPLEMENTATION') THEN
      RAISE EXCEPTION
        'LEO Protocol Violation: Child SD cannot be created until parent SD is at least in LEAD_APPROVAL phase. ' ||
        'Parent "%" is currently in % phase. ' ||
        'Workflow: Parent must be in LEAD_APPROVAL or later to create children.',
        COALESCE(parent_title, NEW.parent_sd_id::TEXT),
        COALESCE(parent_phase, 'NULL');
    END IF;

    -- GUARDRAIL: If parent is in LEAD phase, child must be draft
    IF parent_phase = 'LEAD_APPROVAL' AND NEW.status NOT IN ('draft', 'pending_approval') THEN
      RAISE EXCEPTION
        'LEO Protocol Violation: Child SD must be created as draft when parent is in LEAD_APPROVAL phase. ' ||
        'Cannot create child with status "%" until parent completes LEAD approval.',
        NEW.status;
    END IF;

    -- Log successful child creation
    RAISE NOTICE 'Child SD created: % under parent % (parent phase: %, child status: %)',
      NEW.title, parent_title, parent_phase, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT only (child creation)
CREATE TRIGGER trg_enforce_child_creation_timing
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_child_creation_timing();

-- Add helpful comment
COMMENT ON FUNCTION enforce_child_creation_timing() IS
  'LEO Protocol Layer 1: Enforces child SD creation rules. Children can be created as drafts when parent is in LEAD_APPROVAL or later. Children must be draft status if parent is still in LEAD_APPROVAL phase.';

-- Also add a trigger to prevent child EXEC before parent approval
-- This is the REAL constraint we care about
DROP TRIGGER IF EXISTS trg_prevent_child_exec_before_parent_approval ON strategic_directives_v2;
DROP FUNCTION IF EXISTS prevent_child_exec_before_parent_approval();

CREATE OR REPLACE FUNCTION prevent_child_exec_before_parent_approval()
RETURNS TRIGGER AS $$
DECLARE
  parent_phase TEXT;
  parent_title TEXT;
BEGIN
  -- Only check for child SDs transitioning to EXEC
  IF NEW.parent_sd_id IS NOT NULL
     AND NEW.relationship_type = 'child'
     AND NEW.current_phase IN ('EXEC', 'EXEC_IMPLEMENTATION')
     AND (OLD.current_phase IS NULL OR OLD.current_phase NOT IN ('EXEC', 'EXEC_IMPLEMENTATION'))
  THEN
    -- Get parent's current phase
    SELECT current_phase, title
    INTO parent_phase, parent_title
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    -- Parent must be past LEAD for child to enter EXEC
    IF parent_phase IN ('LEAD_APPROVAL', 'LEAD') THEN
      RAISE EXCEPTION
        'LEO Protocol Violation: Child SD cannot enter EXEC phase until parent completes LEAD approval. ' ||
        'Parent "%" is still in % phase. ' ||
        'Complete parent LEAD approval first.',
        COALESCE(parent_title, NEW.parent_sd_id::TEXT),
        parent_phase;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_child_exec_before_parent_approval
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION prevent_child_exec_before_parent_approval();

COMMENT ON FUNCTION prevent_child_exec_before_parent_approval() IS
  'LEO Protocol: Prevents child SDs from entering EXEC phase before parent completes LEAD approval. This is the key constraint - children can exist as drafts, but cannot execute prematurely.';
