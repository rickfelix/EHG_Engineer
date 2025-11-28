-- ============================================================================
-- Migration: SD-DELIVERABLES-V2-001 Phase 3 - Sub-Agent Result Triggers
-- ============================================================================
-- Implements US-008 from PRD-SD-DELIVERABLES-V2-001
--
-- Trigger: When sub-agents pass, automatically complete matching deliverables
--   - TESTING pass → complete test deliverables
--   - DATABASE pass → complete database deliverables
--   - DESIGN pass → complete UI deliverables
--   - SECURITY pass → add security verification
--
-- Date: 2025-11-28
-- Related SD: SD-DELIVERABLES-V2-001
-- Phase: 3 of 5 (Real-Time Tracking)
-- ============================================================================

-- ============================================================================
-- SECTION 1: Sub-Agent to Deliverable Type Mapping
-- ============================================================================

-- Create mapping table for sub-agent to deliverable type
CREATE TABLE IF NOT EXISTS sd_subagent_deliverable_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_agent_code VARCHAR(50) NOT NULL,
  deliverable_type VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sub_agent_code, deliverable_type)
);

-- Populate default mappings
INSERT INTO sd_subagent_deliverable_mapping (sub_agent_code, deliverable_type, priority)
VALUES
  ('TESTING', 'test', 100),
  ('DATABASE', 'database', 100),
  ('DATABASE', 'migration', 90),
  ('DESIGN', 'ui_feature', 100),
  ('SECURITY', 'api', 80),
  ('SECURITY', 'integration', 70),
  ('QA', 'test', 90),
  ('ARCHITECT', 'api', 80),
  ('ARCHITECT', 'database', 70)
ON CONFLICT (sub_agent_code, deliverable_type) DO NOTHING;

COMMENT ON TABLE sd_subagent_deliverable_mapping IS
  'Maps sub-agent codes to deliverable types for automatic completion triggers';

-- ============================================================================
-- SECTION 2: Sub-Agent Result Trigger Function
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_deliverables_on_subagent_pass()
RETURNS TRIGGER AS $$
DECLARE
  updated_count INTEGER;
  deliverable_types TEXT[];
  dtype TEXT;
BEGIN
  -- Only proceed if verdict is PASS
  IF NEW.verdict != 'PASS' THEN
    RETURN NEW;
  END IF;

  -- Prevent infinite loops
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Get deliverable types for this sub-agent
  SELECT ARRAY_AGG(deliverable_type ORDER BY priority DESC)
  INTO deliverable_types
  FROM sd_subagent_deliverable_mapping
  WHERE sub_agent_code = NEW.sub_agent_code;

  IF deliverable_types IS NULL OR array_length(deliverable_types, 1) IS NULL THEN
    -- No mappings for this sub-agent, skip
    RETURN NEW;
  END IF;

  -- Update matching deliverables
  FOREACH dtype IN ARRAY deliverable_types
  LOOP
    UPDATE sd_scope_deliverables
    SET
      completion_status = 'completed',
      verified_by = NEW.sub_agent_code,
      verified_at = NOW(),
      completion_evidence = format('Sub-agent %s verdict: PASS (confidence: %s%%)',
                                   NEW.sub_agent_code, NEW.confidence),
      completion_notes = format('Auto-completed by sub-agent trigger. Result ID: %s',
                               NEW.id),
      updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed', true,
        'auto_completed_at', NOW(),
        'trigger', 'complete_deliverables_on_subagent_pass',
        'sub_agent_code', NEW.sub_agent_code,
        'sub_agent_result_id', NEW.id,
        'confidence', NEW.confidence
      )
    WHERE sd_id = NEW.sd_id
    AND deliverable_type = dtype
    AND completion_status != 'completed';

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count > 0 THEN
      RAISE NOTICE 'Sub-agent % PASS: Completed % % deliverables for SD %',
        NEW.sub_agent_code, updated_count, dtype, NEW.sd_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 3: Create Trigger on sub_agent_execution_results
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_complete_deliverables_on_subagent ON sub_agent_execution_results;

CREATE TRIGGER trigger_complete_deliverables_on_subagent
  AFTER INSERT ON sub_agent_execution_results
  FOR EACH ROW
  WHEN (NEW.verdict = 'PASS')
  EXECUTE FUNCTION complete_deliverables_on_subagent_pass();

-- Also fire on UPDATE in case verdict changes to PASS
DROP TRIGGER IF EXISTS trigger_complete_deliverables_on_subagent_update ON sub_agent_execution_results;

CREATE TRIGGER trigger_complete_deliverables_on_subagent_update
  AFTER UPDATE ON sub_agent_execution_results
  FOR EACH ROW
  WHEN (NEW.verdict = 'PASS' AND (OLD.verdict IS NULL OR OLD.verdict != 'PASS'))
  EXECUTE FUNCTION complete_deliverables_on_subagent_pass();

-- Comments
COMMENT ON FUNCTION complete_deliverables_on_subagent_pass() IS
  'SD-DELIVERABLES-V2-001 Phase 3: Auto-completes deliverables when sub-agent verdict is PASS.
   Uses mapping table to match sub-agent codes to deliverable types.';

COMMENT ON TRIGGER trigger_complete_deliverables_on_subagent ON sub_agent_execution_results IS
  'Fires when sub-agent result is inserted with PASS verdict to auto-complete matching deliverables';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  mapping_exists BOOLEAN;
  trigger_exists BOOLEAN;
  function_exists BOOLEAN;
BEGIN
  -- Check mapping table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sd_subagent_deliverable_mapping'
  ) INTO mapping_exists;

  -- Check trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_complete_deliverables_on_subagent'
  ) INTO trigger_exists;

  -- Check function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'complete_deliverables_on_subagent_pass'
  ) INTO function_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-DELIVERABLES-V2-001 Phase 3 Migration Verification';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-008 sd_subagent_deliverable_mapping table: %',
    CASE WHEN mapping_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-008 complete_deliverables_on_subagent_pass function: %',
    CASE WHEN function_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-008 trigger_complete_deliverables_on_subagent: %',
    CASE WHEN trigger_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE '============================================================';

  IF mapping_exists AND trigger_exists AND function_exists THEN
    RAISE NOTICE 'Phase 3 Migration: SUCCESS';
  ELSE
    RAISE EXCEPTION 'Phase 3 Migration: FAILED - see above for details';
  END IF;
END $$;
