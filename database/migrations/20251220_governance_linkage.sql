-- Migration: Add Governance Linkage to system_events
-- Created: 2025-12-20
-- SD: SD-HARDENING-V2-002C
-- Purpose: Link system events to PRDs and Strategic Directives for governance audit trail

-- ============================================================================
-- PHASE 1: Add Governance Linkage Columns
-- ============================================================================

-- Add PRD linkage (VARCHAR to match product_requirements_v2.id type)
ALTER TABLE system_events
ADD COLUMN IF NOT EXISTS prd_id VARCHAR(50) REFERENCES product_requirements_v2(id);

COMMENT ON COLUMN system_events.prd_id IS
'Foreign key to product_requirements_v2. Links events to specific PRD context for governance tracking.';

-- Add Strategic Directive linkage (TEXT for IDs like "SD-PARENT-4.0")
ALTER TABLE system_events
ADD COLUMN IF NOT EXISTS sd_id TEXT;

COMMENT ON COLUMN system_events.sd_id IS
'Strategic Directive identifier (e.g., SD-PARENT-4.0, SD-HARDENING-V2-002C). Links events to strategic context for governance tracking.';

-- Add directive context metadata
ALTER TABLE system_events
ADD COLUMN IF NOT EXISTS directive_context JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN system_events.directive_context IS
'Additional governance metadata. Schema: { phase: "LEAD|PLAN|EXEC", priority: number, tags: string[], notes: string }';

-- ============================================================================
-- PHASE 2: Create Indexes for Governance Queries
-- ============================================================================

-- Index for PRD-based governance audits
CREATE INDEX IF NOT EXISTS idx_system_events_prd_id
ON system_events(prd_id)
WHERE prd_id IS NOT NULL;

-- Index for SD-based governance audits
CREATE INDEX IF NOT EXISTS idx_system_events_sd_id
ON system_events(sd_id)
WHERE sd_id IS NOT NULL;

-- Composite index for governance reports (event type + governance linkage)
CREATE INDEX IF NOT EXISTS idx_system_events_governance
ON system_events(event_type, prd_id, sd_id)
WHERE prd_id IS NOT NULL OR sd_id IS NOT NULL;

-- ============================================================================
-- PHASE 3: Add Governance Enforcement Function
-- ============================================================================

-- Function to validate governance requirements
CREATE OR REPLACE FUNCTION enforce_governance_linkage()
RETURNS TRIGGER AS $$
BEGIN
  -- Governance-required event types
  IF NEW.event_type IN (
    'AGENT_PREDICTION',
    'AGENT_OUTCOME',
    'STAGE_TRANSITION',
    'STAGE_TRANSITION_OUTCOME',
    'HANDOFF_PROPOSED',
    'HANDOFF_COMMITTED',
    'DIRECTIVE_ISSUED'
  ) THEN
    -- At least one governance linkage required
    IF NEW.prd_id IS NULL AND NEW.sd_id IS NULL THEN
      RAISE EXCEPTION 'Governance linkage required: event_type "%" must have prd_id or sd_id', NEW.event_type
        USING HINT = 'Set prd_id or sd_id for governance tracking';
    END IF;
  END IF;

  -- System events (BUDGET_CHECK, CAPABILITY_CHECK, etc.) can have NULL governance
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_governance_linkage() IS
'Trigger function to enforce governance linkage requirements. Ensures critical event types have PRD or SD linkage for audit trail.';

-- Create trigger for INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_enforce_governance_linkage ON system_events;
CREATE TRIGGER trg_enforce_governance_linkage
  BEFORE INSERT OR UPDATE ON system_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_governance_linkage();

-- ============================================================================
-- PHASE 4: Backfill Existing Events
-- ============================================================================

-- Backfill EVA_HEALTH_BRIEF events with SD-PARENT-4.0
UPDATE system_events
SET
  sd_id = 'SD-PARENT-4.0',
  directive_context = jsonb_build_object(
    'phase', 'EXEC',
    'notes', 'Backfilled during governance linkage migration',
    'backfill_date', NOW()::text
  )
WHERE event_type = 'EVA_HEALTH_BRIEF'
  AND sd_id IS NULL;

-- Backfill STAGE_TRANSITION events by extracting SD from payload if available
UPDATE system_events
SET
  sd_id = payload->>'sd_id',
  directive_context = jsonb_build_object(
    'phase', payload->>'phase',
    'notes', 'Extracted from payload during migration',
    'backfill_date', NOW()::text
  )
WHERE event_type IN ('STAGE_TRANSITION', 'STAGE_TRANSITION_OUTCOME')
  AND payload ? 'sd_id'
  AND sd_id IS NULL;

-- Backfill AGENT_PREDICTION and AGENT_OUTCOME events
UPDATE system_events
SET
  sd_id = payload->>'sd_id',
  prd_id = payload->>'prd_id',
  directive_context = jsonb_build_object(
    'notes', 'Extracted from payload during migration',
    'backfill_date', NOW()::text
  )
WHERE event_type IN ('AGENT_PREDICTION', 'AGENT_OUTCOME')
  AND (payload ? 'sd_id' OR payload ? 'prd_id')
  AND sd_id IS NULL
  AND prd_id IS NULL;

-- ============================================================================
-- PHASE 5: Verification Queries
-- ============================================================================

-- Report: Events by governance linkage status
DO $$
DECLARE
  total_events INTEGER;
  with_prd INTEGER;
  with_sd INTEGER;
  with_both INTEGER;
  with_none INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_events FROM system_events;
  SELECT COUNT(*) INTO with_prd FROM system_events WHERE prd_id IS NOT NULL;
  SELECT COUNT(*) INTO with_sd FROM system_events WHERE sd_id IS NOT NULL;
  SELECT COUNT(*) INTO with_both FROM system_events WHERE prd_id IS NOT NULL AND sd_id IS NOT NULL;
  SELECT COUNT(*) INTO with_none FROM system_events WHERE prd_id IS NULL AND sd_id IS NULL;

  RAISE NOTICE '=== Governance Linkage Migration Report ===';
  RAISE NOTICE 'Total events: %', total_events;
  RAISE NOTICE 'Events with PRD linkage: %', with_prd;
  RAISE NOTICE 'Events with SD linkage: %', with_sd;
  RAISE NOTICE 'Events with both: %', with_both;
  RAISE NOTICE 'Events with neither: %', with_none;
  RAISE NOTICE '==========================================';
END $$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- DROP TRIGGER IF EXISTS trg_enforce_governance_linkage ON system_events;
-- DROP FUNCTION IF EXISTS enforce_governance_linkage();
-- DROP INDEX IF EXISTS idx_system_events_governance;
-- DROP INDEX IF EXISTS idx_system_events_sd_id;
-- DROP INDEX IF EXISTS idx_system_events_prd_id;
-- ALTER TABLE system_events DROP COLUMN IF EXISTS directive_context;
-- ALTER TABLE system_events DROP COLUMN IF EXISTS sd_id;
-- ALTER TABLE system_events DROP COLUMN IF EXISTS prd_id;
-- ============================================================================
