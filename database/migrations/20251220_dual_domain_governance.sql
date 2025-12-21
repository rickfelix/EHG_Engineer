-- ============================================================================
-- Migration: Dual-Domain Governance Constraint
-- ============================================================================
-- Created: 2025-12-20
-- SD: SD-HARDENING-V2-003 (Strategic Hardening v2.4.2)
-- Purpose: Implement dual-domain governance model
--
-- DOMAINS:
--   1. LEO Protocol Domain (Meta-Governance): Creates SDs/PRDs
--      - Agents: LEAD, PLAN, EXEC
--      - Anchor: sd_id REQUIRED, prd_id OPTIONAL
--
--   2. Venture Execution Domain (Operational): Executes PRDs
--      - Agents: VENTURE_CEO, VP_*, EVA_*, CREW
--      - Anchor: prd_id REQUIRED, sd_id INHERITED
--
--   3. System Domain (Infrastructure): System operations
--      - Events: BUDGET_CHECK, CAPABILITY_CHECK, SYSTEM_MIGRATION
--      - Anchor: NONE REQUIRED
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Drop Old Trigger (if exists from previous migration)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_enforce_governance_linkage ON system_events;
DROP FUNCTION IF EXISTS enforce_governance_linkage();

-- ============================================================================
-- PHASE 2: Create Dual-Domain Governance Function
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_dual_domain_governance()
RETURNS TRIGGER AS $$
DECLARE
  is_leo_agent BOOLEAN;
  is_venture_agent BOOLEAN;
  is_system_event BOOLEAN;
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

  -- Rule 3: Venture Execution agents require prd_id (they EXECUTE governance)
  IF is_venture_agent THEN
    IF NEW.prd_id IS NULL THEN
      -- Allow sd_id as fallback for venture agents (for system-level venture operations)
      IF NEW.sd_id IS NULL THEN
        RAISE EXCEPTION 'Venture governance required: actor_role "%" must have prd_id or sd_id (Venture agents execute under PRD authority)', NEW.actor_role
          USING HINT = 'Set prd_id to the PRD being executed, or sd_id for system-level operations';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Rule 4: Governance-critical event types always require linkage
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
'Dual-Domain Governance Enforcement:
- LEO Protocol agents (LEAD/PLAN/EXEC): Require sd_id (they CREATE governance)
- Venture agents (CEO/VP/EVA/CREW): Require prd_id or sd_id (they EXECUTE governance)
- System events: No governance required (infrastructure operations)

This prevents Cognitive Drift by ensuring every agent action is traceable to its authorizing directive.';

-- ============================================================================
-- PHASE 3: Create Trigger
-- ============================================================================

CREATE TRIGGER trg_enforce_dual_domain_governance
  BEFORE INSERT OR UPDATE ON system_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_dual_domain_governance();

-- ============================================================================
-- PHASE 4: Backfill Existing Events with Proper Domain Classification
-- ============================================================================

-- Backfill EVA_HEALTH_SCANNER events with SD-PARENT-4.0
UPDATE system_events
SET
  sd_id = 'SD-PARENT-4.0',
  directive_context = jsonb_build_object(
    'domain', 'VENTURE_EXECUTION',
    'phase', 'EXEC',
    'notes', 'Backfilled: EVA First Pulse',
    'backfill_date', NOW()::text
  )
WHERE actor_role = 'EVA_HEALTH_SCANNER'
  AND sd_id IS NULL;

-- Backfill SEED events from genesis pulse
UPDATE system_events
SET
  sd_id = 'SD-UNIFIED-PATH-2.2.1',
  directive_context = jsonb_build_object(
    'domain', 'LEO_PROTOCOL',
    'phase', 'EXEC',
    'notes', 'Backfilled: Genesis Seed Data',
    'backfill_date', NOW()::text
  )
WHERE idempotency_key LIKE 'SEED-%'
  AND sd_id IS NULL;

-- ============================================================================
-- PHASE 5: Create Governance Audit Views
-- ============================================================================

-- View: Events by governance domain
CREATE OR REPLACE VIEW v_governance_audit AS
SELECT
  event_type,
  actor_role,
  CASE
    WHEN actor_role IN ('LEAD', 'PLAN', 'EXEC', 'LEO_PROTOCOL', 'SYSTEM_MIGRATION') THEN 'LEO_PROTOCOL'
    WHEN actor_role LIKE 'VP_%' OR actor_role LIKE 'EVA_%' OR actor_role IN ('VENTURE_CEO', 'CEO', 'CREW') THEN 'VENTURE_EXECUTION'
    WHEN event_type IN ('BUDGET_CHECK', 'CAPABILITY_CHECK', 'AGENT_INSTANTIATION') THEN 'SYSTEM'
    ELSE 'UNCLASSIFIED'
  END as governance_domain,
  sd_id,
  prd_id,
  CASE
    WHEN prd_id IS NOT NULL AND sd_id IS NOT NULL THEN 'FULL'
    WHEN sd_id IS NOT NULL THEN 'SD_ONLY'
    WHEN prd_id IS NOT NULL THEN 'PRD_ONLY'
    ELSE 'NONE'
  END as linkage_status,
  created_at
FROM system_events
ORDER BY created_at DESC;

COMMENT ON VIEW v_governance_audit IS
'Governance audit view showing domain classification and linkage status for all system events.';

-- View: Governance compliance summary
CREATE OR REPLACE VIEW v_governance_compliance AS
SELECT
  CASE
    WHEN actor_role IN ('LEAD', 'PLAN', 'EXEC', 'LEO_PROTOCOL', 'SYSTEM_MIGRATION') THEN 'LEO_PROTOCOL'
    WHEN actor_role LIKE 'VP_%' OR actor_role LIKE 'EVA_%' OR actor_role IN ('VENTURE_CEO', 'CEO', 'CREW') THEN 'VENTURE_EXECUTION'
    WHEN event_type IN ('BUDGET_CHECK', 'CAPABILITY_CHECK', 'AGENT_INSTANTIATION') THEN 'SYSTEM'
    ELSE 'UNCLASSIFIED'
  END as governance_domain,
  COUNT(*) as total_events,
  COUNT(sd_id) as with_sd,
  COUNT(prd_id) as with_prd,
  COUNT(*) FILTER (WHERE sd_id IS NOT NULL OR prd_id IS NOT NULL) as compliant,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE sd_id IS NOT NULL OR prd_id IS NOT NULL) / NULLIF(COUNT(*), 0),
    1
  ) as compliance_pct
FROM system_events
GROUP BY 1
ORDER BY 1;

COMMENT ON VIEW v_governance_compliance IS
'Governance compliance summary by domain. Shows percentage of events with proper governance linkage.';

-- ============================================================================
-- PHASE 6: Verification
-- ============================================================================

DO $$
DECLARE
  leo_events INTEGER;
  venture_events INTEGER;
  system_events_count INTEGER;
  unclassified INTEGER;
BEGIN
  SELECT COUNT(*) INTO leo_events
  FROM system_events
  WHERE actor_role IN ('LEAD', 'PLAN', 'EXEC', 'LEO_PROTOCOL', 'SYSTEM_MIGRATION');

  SELECT COUNT(*) INTO venture_events
  FROM system_events
  WHERE actor_role LIKE 'VP_%'
     OR actor_role LIKE 'EVA_%'
     OR actor_role IN ('VENTURE_CEO', 'CEO', 'CREW');

  SELECT COUNT(*) INTO system_events_count
  FROM system_events
  WHERE event_type IN ('BUDGET_CHECK', 'CAPABILITY_CHECK', 'AGENT_INSTANTIATION');

  SELECT COUNT(*) INTO unclassified
  FROM system_events
  WHERE actor_role NOT IN ('LEAD', 'PLAN', 'EXEC', 'LEO_PROTOCOL', 'SYSTEM_MIGRATION', 'VENTURE_CEO', 'CEO', 'CREW')
    AND actor_role NOT LIKE 'VP_%'
    AND actor_role NOT LIKE 'EVA_%'
    AND event_type NOT IN ('BUDGET_CHECK', 'CAPABILITY_CHECK', 'AGENT_INSTANTIATION');

  RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║     DUAL-DOMAIN GOVERNANCE MIGRATION COMPLETE              ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Domain Classification:';
  RAISE NOTICE '  LEO Protocol events:      %', leo_events;
  RAISE NOTICE '  Venture Execution events: %', venture_events;
  RAISE NOTICE '  System events:            %', system_events_count;
  RAISE NOTICE '  Unclassified events:      %', unclassified;
  RAISE NOTICE '';
  RAISE NOTICE 'Governance enforcement is now ACTIVE.';
  RAISE NOTICE 'Run: SELECT * FROM v_governance_compliance; for audit report.';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- DROP VIEW IF EXISTS v_governance_compliance;
-- DROP VIEW IF EXISTS v_governance_audit;
-- DROP TRIGGER IF EXISTS trg_enforce_dual_domain_governance ON system_events;
-- DROP FUNCTION IF EXISTS enforce_dual_domain_governance();
--
-- Then re-apply the original governance trigger if needed.
-- ============================================================================
