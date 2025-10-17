-- =====================================================
-- SUB-AGENT AUTOMATION SYSTEM
-- Automatically triggers required sub-agents on events
-- =====================================================

-- 1. Create sub_agent_queue table for tracking required activations
CREATE TABLE IF NOT EXISTS sub_agent_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sd_id UUID REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  sub_agent_code TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_subagent_queue_status ON sub_agent_queue(status);
CREATE INDEX IF NOT EXISTS idx_subagent_queue_sd ON sub_agent_queue(sd_id);
CREATE INDEX IF NOT EXISTS idx_subagent_queue_priority ON sub_agent_queue(priority DESC, created_at ASC);

-- 2. Function to queue required sub-agents
CREATE OR REPLACE FUNCTION queue_required_subagents(
  p_sd_id UUID,
  p_trigger_event TEXT
) RETURNS TABLE(sub_agent_code TEXT, priority INTEGER) AS $$
BEGIN
  -- Continuous Improvement Coach triggers
  IF p_trigger_event IN (
    'SD_STATUS_COMPLETED',
    'LEAD_APPROVAL_COMPLETE',
    'PHASE_COMPLETE',
    'EXEC_SPRINT_COMPLETE',
    'PLAN_VERIFICATION_COMPLETE'
  ) THEN
    INSERT INTO sub_agent_queue (sd_id, sub_agent_code, trigger_event, priority)
    VALUES (p_sd_id, 'CONTINUOUS_IMPROVEMENT_COACH', p_trigger_event, 9)
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT 'CONTINUOUS_IMPROVEMENT_COACH'::TEXT, 9;
  END IF;

  -- DevOps Platform Architect triggers
  IF p_trigger_event IN (
    'EXEC_IMPLEMENTATION_COMPLETE',
    'PLAN_VERIFICATION_PASS',
    'LEAD_APPROVAL_COMPLETE'
  ) THEN
    INSERT INTO sub_agent_queue (sd_id, sub_agent_code, trigger_event, priority)
    VALUES (p_sd_id, 'DEVOPS_PLATFORM_ARCHITECT', p_trigger_event, 8)
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT 'DEVOPS_PLATFORM_ARCHITECT'::TEXT, 8;
  END IF;

  -- Add more sub-agent triggers as needed
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger function on SD status change
CREATE OR REPLACE FUNCTION trigger_subagents_on_sd_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When SD is marked as completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    PERFORM queue_required_subagents(NEW.id, 'SD_STATUS_COMPLETED');
  END IF;

  -- When SD moves to pending_approval
  IF NEW.status = 'pending_approval' AND OLD.status != 'pending_approval' THEN
    PERFORM queue_required_subagents(NEW.id, 'LEAD_APPROVAL_REQUIRED');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger to strategic_directives_v2
DROP TRIGGER IF EXISTS trg_subagent_automation ON strategic_directives_v2;
CREATE TRIGGER trg_subagent_automation
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_subagents_on_sd_status_change();

-- 5. Function to check if all required sub-agents are complete
CREATE OR REPLACE FUNCTION check_subagent_completion(p_sd_id UUID)
RETURNS TABLE(
  all_complete BOOLEAN,
  pending_count INTEGER,
  failed_count INTEGER,
  pending_agents TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) = 0 as all_complete,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER as pending_count,
    COUNT(*) FILTER (WHERE status = 'failed')::INTEGER as failed_count,
    ARRAY_AGG(sub_agent_code) FILTER (WHERE status IN ('pending', 'in_progress')) as pending_agents
  FROM sub_agent_queue
  WHERE sd_id = p_sd_id;
END;
$$ LANGUAGE plpgsql;

-- 6. View for dashboard to show pending sub-agent work
CREATE OR REPLACE VIEW v_pending_subagent_work AS
SELECT
  q.id as queue_id,
  q.sd_id,
  sd.sd_key,
  sd.title as sd_title,
  sd.status as sd_status,
  q.sub_agent_code,
  q.trigger_event,
  q.status as queue_status,
  q.priority,
  q.created_at,
  q.started_at,
  EXTRACT(EPOCH FROM (NOW() - q.created_at))/3600 as hours_pending
FROM sub_agent_queue q
JOIN strategic_directives_v2 sd ON q.sd_id = sd.id
WHERE q.status IN ('pending', 'in_progress')
ORDER BY q.priority DESC, q.created_at ASC;

-- 7. Function to mark sub-agent work as complete
CREATE OR REPLACE FUNCTION complete_subagent_work(
  p_queue_id UUID,
  p_result JSONB
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE sub_agent_queue
  SET
    status = 'completed',
    completed_at = NOW(),
    result = p_result
  WHERE id = p_queue_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- 8. Function to block LEAD approval if sub-agents incomplete
CREATE OR REPLACE FUNCTION validate_lead_approval(p_sd_id UUID)
RETURNS TABLE(
  can_approve BOOLEAN,
  blocking_reason TEXT,
  pending_subagents TEXT[]
) AS $$
DECLARE
  v_completion RECORD;
  v_retro_count INTEGER;
BEGIN
  -- Check sub-agent completion
  SELECT * INTO v_completion FROM check_subagent_completion(p_sd_id);

  -- Check retrospective
  SELECT COUNT(*) INTO v_retro_count
  FROM retrospectives
  WHERE sd_id = p_sd_id;

  -- Determine if can approve
  IF NOT v_completion.all_complete THEN
    RETURN QUERY SELECT
      FALSE,
      'Required sub-agents not completed'::TEXT,
      v_completion.pending_agents;
  ELSIF v_retro_count = 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'Retrospective not generated'::TEXT,
      ARRAY['CONTINUOUS_IMPROVEMENT_COACH']::TEXT[];
  ELSE
    RETURN QUERY SELECT
      TRUE,
      NULL::TEXT,
      NULL::TEXT[];
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 9. Grant permissions (adjust as needed)
GRANT SELECT ON sub_agent_queue TO anon, authenticated;
GRANT SELECT ON v_pending_subagent_work TO anon, authenticated;
GRANT EXECUTE ON FUNCTION queue_required_subagents TO authenticated;
GRANT EXECUTE ON FUNCTION check_subagent_completion TO authenticated;
GRANT EXECUTE ON FUNCTION validate_lead_approval TO authenticated;

-- 10. Add helpful comments
COMMENT ON TABLE sub_agent_queue IS 'Queue of required sub-agent activations triggered by SD events';
COMMENT ON FUNCTION queue_required_subagents IS 'Automatically queues required sub-agents based on trigger event';
COMMENT ON FUNCTION validate_lead_approval IS 'Validates all requirements are met before LEAD can approve SD';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check if automation is working
SELECT 'Automation installed successfully' as status;

-- Show pending sub-agent work
SELECT * FROM v_pending_subagent_work LIMIT 5;
