-- Migration: Create sd_phase_progress Table for Granular Phase Tracking
-- Date: 2025-10-12
-- Issue: Progress calculation is complex and error-prone. Need explicit phase completion tracking.
-- Solution: Create dedicated table to track each phase's completion status, sub-agents, and timestamps

-- ============================================================================
-- TABLE: sd_phase_progress
-- Purpose: Track completion status for each phase of every Strategic Directive
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_phase_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL CHECK (
    phase_name IN ('LEAD_PRE_APPROVAL', 'PLAN_PRD', 'EXEC_IMPL', 'PLAN_VERIFY', 'LEAD_FINAL')
  ),
  phase_percentage INTEGER NOT NULL CHECK (
    (phase_name = 'LEAD_PRE_APPROVAL' AND phase_percentage = 20) OR
    (phase_name = 'PLAN_PRD' AND phase_percentage = 20) OR
    (phase_name = 'EXEC_IMPL' AND phase_percentage = 30) OR
    (phase_name = 'PLAN_VERIFY' AND phase_percentage = 15) OR
    (phase_name = 'LEAD_FINAL' AND phase_percentage = 15)
  ),
  is_complete BOOLEAN DEFAULT FALSE,
  sub_agents_required JSONB DEFAULT '[]'::jsonb,
  sub_agents_completed JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sd_id, phase_name)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_phase_progress_sd_id ON sd_phase_progress(sd_id);
CREATE INDEX IF NOT EXISTS idx_phase_progress_phase_name ON sd_phase_progress(phase_name);
CREATE INDEX IF NOT EXISTS idx_phase_progress_is_complete ON sd_phase_progress(is_complete);
CREATE INDEX IF NOT EXISTS idx_phase_progress_completed_at ON sd_phase_progress(completed_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE sd_phase_progress ENABLE ROW LEVEL SECURITY;

-- Allow all operations with service role (for system operations)
CREATE POLICY "Service role full access on sd_phase_progress"
  ON sd_phase_progress
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read phase progress
CREATE POLICY "Authenticated users can read phase progress"
  ON sd_phase_progress
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert/update phase progress
CREATE POLICY "Authenticated users can modify phase progress"
  ON sd_phase_progress
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_phase_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_phase_progress_timestamp
  BEFORE UPDATE ON sd_phase_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_phase_progress_timestamp();

-- ============================================================================
-- TRIGGER: Auto-populate phase tracking when SD created
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_phase_tracking()
RETURNS TRIGGER AS $$
BEGIN
  -- Create 5 phase records for new Strategic Directive
  INSERT INTO sd_phase_progress (sd_id, phase_name, phase_percentage, is_complete)
  VALUES
    (NEW.id, 'LEAD_PRE_APPROVAL', 20, CASE WHEN NEW.status NOT IN ('Draft', 'Under Review') THEN TRUE ELSE FALSE END),
    (NEW.id, 'PLAN_PRD', 20, FALSE),
    (NEW.id, 'EXEC_IMPL', 30, FALSE),
    (NEW.id, 'PLAN_VERIFY', 15, FALSE),
    (NEW.id, 'LEAD_FINAL', 15, FALSE)
  ON CONFLICT (sd_id, phase_name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_phase_tracking
  AFTER INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_phase_tracking();

-- ============================================================================
-- TRIGGER: Mark phase complete when handoff created
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_phase_complete_on_handoff()
RETURNS TRIGGER AS $$
DECLARE
  phase_to_complete TEXT;
BEGIN
  -- Determine which phase to mark complete based on handoff type
  phase_to_complete := CASE NEW.handoff_type
    WHEN 'LEAD-to-PLAN' THEN 'LEAD_PRE_APPROVAL'
    WHEN 'strategic_to_technical' THEN 'LEAD_PRE_APPROVAL'
    WHEN 'PLAN-to-EXEC' THEN 'PLAN_PRD'
    WHEN 'technical_to_implementation' THEN 'PLAN_PRD'
    WHEN 'EXEC-to-PLAN' THEN 'EXEC_IMPL'
    WHEN 'implementation_to_verification' THEN 'EXEC_IMPL'
    WHEN 'PLAN-to-LEAD' THEN 'PLAN_VERIFY'
    WHEN 'verification_to_approval' THEN 'PLAN_VERIFY'
    ELSE NULL
  END;

  IF phase_to_complete IS NOT NULL THEN
    UPDATE sd_phase_progress
    SET
      is_complete = TRUE,
      completed_at = NOW()
    WHERE sd_id = NEW.sd_id AND phase_name = phase_to_complete;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_phase_complete_on_handoff
  AFTER INSERT ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION mark_phase_complete_on_handoff();

-- ============================================================================
-- TRIGGER: Update sub_agents_completed when sub-agent executes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_phase_subagents_on_execution()
RETURNS TRIGGER AS $$
DECLARE
  current_phase TEXT;
BEGIN
  -- Determine current phase based on sub-agent execution timing
  -- (This is a simplified heuristic - in production, phase context would be passed)
  SELECT phase_name INTO current_phase
  FROM sd_phase_progress
  WHERE sd_id = NEW.sd_id
  AND is_complete = FALSE
  ORDER BY
    CASE phase_name
      WHEN 'LEAD_PRE_APPROVAL' THEN 1
      WHEN 'PLAN_PRD' THEN 2
      WHEN 'EXEC_IMPL' THEN 3
      WHEN 'PLAN_VERIFY' THEN 4
      WHEN 'LEAD_FINAL' THEN 5
    END
  LIMIT 1;

  IF current_phase IS NOT NULL THEN
    UPDATE sd_phase_progress
    SET sub_agents_completed = COALESCE(sub_agents_completed, '[]'::jsonb) ||
        jsonb_build_object(
          'code', NEW.sub_agent_code,
          'verdict', NEW.verdict,
          'executed_at', NEW.created_at
        )
    WHERE sd_id = NEW.sd_id AND phase_name = current_phase;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_phase_subagents_on_execution
  AFTER INSERT ON sub_agent_execution_results
  FOR EACH ROW
  EXECUTE FUNCTION update_phase_subagents_on_execution();

-- ============================================================================
-- HELPER FUNCTION: Calculate progress from phase tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_progress_from_phases(p_sd_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  total_progress INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(phase_percentage), 0)
  INTO total_progress
  FROM sd_phase_progress
  WHERE sd_id = p_sd_id AND is_complete = TRUE;

  RETURN total_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Get current phase for SD
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_phase(p_sd_id TEXT)
RETURNS TEXT AS $$
DECLARE
  current_phase TEXT;
BEGIN
  SELECT phase_name INTO current_phase
  FROM sd_phase_progress
  WHERE sd_id = p_sd_id
  AND is_complete = FALSE
  ORDER BY
    CASE phase_name
      WHEN 'LEAD_PRE_APPROVAL' THEN 1
      WHEN 'PLAN_PRD' THEN 2
      WHEN 'EXEC_IMPL' THEN 3
      WHEN 'PLAN_VERIFY' THEN 4
      WHEN 'LEAD_FINAL' THEN 5
    END
  LIMIT 1;

  RETURN COALESCE(current_phase, 'COMPLETE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sd_phase_progress IS 'Tracks completion status for each phase of Strategic Directives. Enables granular progress calculation and sub-agent tracking per phase.';

COMMENT ON COLUMN sd_phase_progress.phase_name IS 'Phase name: LEAD_PRE_APPROVAL (20%), PLAN_PRD (20%), EXEC_IMPL (30%), PLAN_VERIFY (15%), LEAD_FINAL (15%)';
COMMENT ON COLUMN sd_phase_progress.phase_percentage IS 'Progress percentage contributed by this phase when complete. Must match phase_name.';
COMMENT ON COLUMN sd_phase_progress.sub_agents_required IS 'Array of sub-agent codes required for this phase (populated by orchestrator)';
COMMENT ON COLUMN sd_phase_progress.sub_agents_completed IS 'Array of executed sub-agents with verdicts (auto-updated on execution)';

COMMENT ON FUNCTION calculate_progress_from_phases IS 'Calculate SD progress by summing completed phase percentages. Returns 0-100.';
COMMENT ON FUNCTION get_current_phase IS 'Get current active phase for SD. Returns phase_name or COMPLETE if all done.';

-- ============================================================================
-- BACKFILL: Populate phase tracking for existing SDs
-- ============================================================================

DO $$
DECLARE
  sd_record RECORD;
  phase_status RECORD;
BEGIN
  -- For each existing SD, create phase tracking records
  FOR sd_record IN (SELECT id, status, progress FROM strategic_directives_v2) LOOP

    -- LEAD_PRE_APPROVAL (completed if status != Draft/Under Review)
    INSERT INTO sd_phase_progress (sd_id, phase_name, phase_percentage, is_complete, completed_at)
    VALUES (
      sd_record.id,
      'LEAD_PRE_APPROVAL',
      20,
      sd_record.status NOT IN ('Draft', 'Under Review'),
      CASE WHEN sd_record.status NOT IN ('Draft', 'Under Review') THEN NOW() ELSE NULL END
    )
    ON CONFLICT (sd_id, phase_name) DO NOTHING;

    -- PLAN_PRD (completed if PRD exists)
    INSERT INTO sd_phase_progress (sd_id, phase_name, phase_percentage, is_complete, completed_at)
    SELECT
      sd_record.id,
      'PLAN_PRD',
      20,
      EXISTS (SELECT 1 FROM product_requirements_v2 WHERE strategic_directive_id = sd_record.id),
      CASE WHEN EXISTS (SELECT 1 FROM product_requirements_v2 WHERE strategic_directive_id = sd_record.id)
           THEN NOW() ELSE NULL END
    ON CONFLICT (sd_id, phase_name) DO NOTHING;

    -- EXEC_IMPL (completed if EXEC->PLAN handoff exists)
    INSERT INTO sd_phase_progress (sd_id, phase_name, phase_percentage, is_complete, completed_at)
    SELECT
      sd_record.id,
      'EXEC_IMPL',
      30,
      EXISTS (SELECT 1 FROM sd_phase_handoffs
              WHERE sd_id = sd_record.id
              AND handoff_type IN ('EXEC-to-PLAN', 'implementation_to_verification')),
      CASE WHEN EXISTS (SELECT 1 FROM sd_phase_handoffs
                        WHERE sd_id = sd_record.id
                        AND handoff_type IN ('EXEC-to-PLAN', 'implementation_to_verification'))
           THEN NOW() ELSE NULL END
    ON CONFLICT (sd_id, phase_name) DO NOTHING;

    -- PLAN_VERIFY (completed if PLAN->LEAD handoff exists)
    INSERT INTO sd_phase_progress (sd_id, phase_name, phase_percentage, is_complete, completed_at)
    SELECT
      sd_record.id,
      'PLAN_VERIFY',
      15,
      EXISTS (SELECT 1 FROM sd_phase_handoffs
              WHERE sd_id = sd_record.id
              AND handoff_type IN ('PLAN-to-LEAD', 'verification_to_approval')),
      CASE WHEN EXISTS (SELECT 1 FROM sd_phase_handoffs
                        WHERE sd_id = sd_record.id
                        AND handoff_type IN ('PLAN-to-LEAD', 'verification_to_approval'))
           THEN NOW() ELSE NULL END
    ON CONFLICT (sd_id, phase_name) DO NOTHING;

    -- LEAD_FINAL (completed if status = Completed)
    INSERT INTO sd_phase_progress (sd_id, phase_name, phase_percentage, is_complete, completed_at)
    VALUES (
      sd_record.id,
      'LEAD_FINAL',
      15,
      sd_record.status = 'Completed',
      CASE WHEN sd_record.status = 'Completed' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (sd_id, phase_name) DO NOTHING;

  END LOOP;

  RAISE NOTICE 'Phase tracking backfill completed for existing Strategic Directives';
END $$;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  phase_count INTEGER;
  trigger_count INTEGER;
BEGIN
  -- Check phase records exist
  SELECT COUNT(*) INTO phase_count FROM sd_phase_progress;
  RAISE NOTICE 'Phase tracking records created: %', phase_count;

  -- Check triggers are created
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgname IN (
    'trigger_update_phase_progress_timestamp',
    'trigger_auto_create_phase_tracking',
    'trigger_mark_phase_complete_on_handoff',
    'trigger_update_phase_subagents_on_execution'
  );
  RAISE NOTICE 'Phase tracking triggers created: % / 4', trigger_count;

  -- Validate sample progress calculation
  RAISE NOTICE 'Testing progress calculation...';
  PERFORM calculate_progress_from_phases((SELECT id FROM strategic_directives_v2 LIMIT 1));
  RAISE NOTICE 'Progress calculation function validated';

END $$;
