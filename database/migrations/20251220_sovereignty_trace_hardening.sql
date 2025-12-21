-- ============================================================================
-- Migration: Sovereignty Trace Hardening
-- ============================================================================
-- Created: 2025-12-20
-- SD: SD-HARDENING-V2-004 (Sovereignty Trace)
-- Purpose: Tighten venture execution governance - require prd_id
--
-- THE LAW: Venture Execution agents MUST have prd_id.
-- sd_id alone is NOT sufficient for venture execution.
--
-- EXCEPTION: EVA meta-operations (health scans) can use sd_id only
-- because they operate at the venture-level, not under a specific PRD.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Drop and Replace Dual-Domain Governance Function
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_dual_domain_governance()
RETURNS TRIGGER AS $$
DECLARE
  is_leo_agent BOOLEAN;
  is_venture_agent BOOLEAN;
  is_system_event BOOLEAN;
  is_eva_meta_operation BOOLEAN;
BEGIN
  -- Classify the actor/event domain

  -- LEO Protocol Domain: Meta-governance agents that CREATE SDs/PRDs
  is_leo_agent := NEW.actor_role IN (
    'LEAD',           -- Approval authority
    'PLAN',           -- PRD creation
    'EXEC',           -- Implementation
    'LEO_PROTOCOL',   -- Generic LEO operations
    'SYSTEM_MIGRATION' -- Governance migrations
  );

  -- Venture Execution Domain: Agents that EXECUTE under PRD authority
  is_venture_agent := NEW.actor_role IN (
    'VENTURE_CEO',
    'VP_IDEATION',
    'VP_VALIDATION',
    'VP_DEVELOPMENT',
    'VP_LAUNCH',
    'EVA_HEALTH_SCANNER',
    'EVA_COORDINATOR',
    'CREW',
    'CEO'  -- Legacy role name
  ) OR NEW.actor_role LIKE 'VP_%'
    OR NEW.actor_role LIKE 'EVA_%'
    OR NEW.actor_role LIKE 'CREW_%';

  -- System Domain: Infrastructure events that don't require governance
  is_system_event := NEW.event_type IN (
    'BUDGET_CHECK',
    'CAPABILITY_CHECK',
    'AGENT_INSTANTIATION',
    'SYSTEM_STARTUP',
    'SYSTEM_SHUTDOWN',
    'HEALTH_CHECK',
    'MIGRATION_APPLIED',
    'ZOMBIE_VENTURE_CLEANUP'
  );

  -- SD-HARDENING-V2-004: EVA meta-operations are exempt from prd_id requirement
  -- These are venture-level health scans, not PRD-specific execution
  -- Includes predictions/outcomes logged during health scans
  is_eva_meta_operation := NEW.actor_role = 'EVA_HEALTH_SCANNER'
    AND NEW.event_type IN (
      'EVA_HEALTH_BRIEF',
      'HEALTH_CHECK',
      'VENTURE_HEALTH_SCAN',
      'AGENT_PREDICTION',   -- Predictions during health scans
      'AGENT_OUTCOME'       -- Outcomes during health scans
    );

  -- ========================================
  -- GOVERNANCE ENFORCEMENT RULES
  -- ========================================

  -- Rule 1: System events are exempt from governance
  IF is_system_event THEN
    RETURN NEW;
  END IF;

  -- Rule 2: LEO Protocol agents require sd_id (they CREATE governance)
  IF is_leo_agent THEN
    IF NEW.sd_id IS NULL THEN
      RAISE EXCEPTION 'LEO Protocol governance required: actor_role "%" must have sd_id (LEO agents create governance, they anchor to Strategic Directives)', NEW.actor_role
        USING HINT = 'Set sd_id to the Strategic Directive being worked on';
    END IF;
    -- prd_id is optional for LEO agents (PRD may not exist yet during PLAN phase)
    RETURN NEW;
  END IF;

  -- Rule 3: EVA meta-operations can use sd_id only (venture-level, not PRD-specific)
  IF is_eva_meta_operation THEN
    IF NEW.sd_id IS NULL THEN
      RAISE EXCEPTION 'EVA meta-operation governance required: actor_role "%" must have sd_id', NEW.actor_role
        USING HINT = 'Set sd_id to the parent Strategic Directive for this health scan';
    END IF;
    -- prd_id not required for meta-operations
    RETURN NEW;
  END IF;

  -- Rule 4: Venture Execution agents REQUIRE prd_id (SD-HARDENING-V2-004)
  -- THE LAW: Venture agents execute under PRD authority. sd_id alone is NOT sufficient.
  IF is_venture_agent THEN
    IF NEW.prd_id IS NULL THEN
      RAISE EXCEPTION 'Venture execution governance HARD BLOCK: actor_role "%" MUST have prd_id (sd_id-only is not sufficient for venture execution)', NEW.actor_role
        USING HINT = 'Every venture execution action must trace to a specific PRD. Set prd_id to the PRD being executed.';
    END IF;
    -- sd_id is encouraged but not required (can be inherited from PRD)
    RETURN NEW;
  END IF;

  -- Rule 5: Governance-critical event types always require linkage
  IF NEW.event_type IN (
    'AGENT_PREDICTION',
    'AGENT_OUTCOME',
    'STAGE_TRANSITION',
    'STAGE_TRANSITION_OUTCOME',
    'HANDOFF_PROPOSED',
    'HANDOFF_COMMITTED',
    'STRATEGIC_PIVOT',
    'DIRECTIVE_ISSUED',
    'EVA_HEALTH_BRIEF'
  ) THEN
    IF NEW.prd_id IS NULL AND NEW.sd_id IS NULL THEN
      RAISE EXCEPTION 'Governance linkage required: event_type "%" must have prd_id or sd_id for audit trail', NEW.event_type
        USING HINT = 'All governance-critical events must be traceable to a Strategic Directive or PRD';
    END IF;
  END IF;

  -- Default: Allow event (non-critical events without governance)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_dual_domain_governance() IS
'SD-HARDENING-V2-004: Tightened Sovereignty Trace
- LEO Protocol agents (LEAD/PLAN/EXEC): Require sd_id (they CREATE governance)
- EVA meta-operations (health scans): Require sd_id only (venture-level ops)
- Venture agents (CEO/VP/CREW): REQUIRE prd_id (NOT sd_id-only)
- System events: No governance required (infrastructure operations)

This prevents Cognitive Drift by ensuring every venture execution action
is traceable to its authorizing PRD, not just the parent SD.';

-- ============================================================================
-- PHASE 2: Verification Query
-- ============================================================================

DO $$
DECLARE
  venture_events_without_prd INTEGER;
BEGIN
  -- Count venture events that would fail under new rules (for audit)
  SELECT COUNT(*) INTO venture_events_without_prd
  FROM system_events
  WHERE (actor_role IN ('VENTURE_CEO', 'CEO', 'CREW')
     OR actor_role LIKE 'VP_%'
     OR (actor_role LIKE 'EVA_%' AND event_type NOT IN ('EVA_HEALTH_BRIEF', 'HEALTH_CHECK', 'VENTURE_HEALTH_SCAN')))
    AND prd_id IS NULL;

  RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║     SOVEREIGNTY TRACE HARDENING COMPLETE                   ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'SD-HARDENING-V2-004: Venture agents now REQUIRE prd_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Domain Rules:';
  RAISE NOTICE '  LEO Protocol:    sd_id REQUIRED (prd_id optional)';
  RAISE NOTICE '  EVA Meta-Ops:    sd_id REQUIRED (prd_id not needed)';
  RAISE NOTICE '  Venture Exec:    prd_id REQUIRED (sd_id encouraged)';
  RAISE NOTICE '  System Events:   No governance required';
  RAISE NOTICE '';
  RAISE NOTICE 'Existing events without prd_id: %', venture_events_without_prd;
  RAISE NOTICE '(Note: Existing events are grandfathered, new events must comply)';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration and restore the permissive sd_id fallback:
--
-- Re-apply the original 20251220_dual_domain_governance.sql migration.
-- ============================================================================
