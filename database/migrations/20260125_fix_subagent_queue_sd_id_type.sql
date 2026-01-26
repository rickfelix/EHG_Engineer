-- =====================================================
-- FIX: sub_agent_queue sd_id type mismatch
-- Issue: strategic_directives_v2.id is VARCHAR(50), not UUID
-- Cause: create-subagent-automation.sql incorrectly defined sd_id as UUID
-- =====================================================

-- 1. Drop dependent objects first
DROP VIEW IF EXISTS v_pending_subagent_work CASCADE;

-- 2. Drop dependent functions (they reference the UUID parameter type)
DROP FUNCTION IF EXISTS queue_required_subagents(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS check_subagent_completion(UUID) CASCADE;
DROP FUNCTION IF EXISTS validate_lead_approval(UUID) CASCADE;
DROP FUNCTION IF EXISTS complete_subagent_work(UUID, JSONB) CASCADE;

-- 3. Alter sub_agent_queue.sd_id column type
ALTER TABLE sub_agent_queue
  ALTER COLUMN sd_id TYPE VARCHAR(50);

-- 4. Recreate foreign key constraint with correct type
ALTER TABLE sub_agent_queue
  DROP CONSTRAINT IF EXISTS sub_agent_queue_sd_id_fkey CASCADE;

ALTER TABLE sub_agent_queue
  ADD CONSTRAINT sub_agent_queue_sd_id_fkey
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

-- 5. Recreate queue_required_subagents function with VARCHAR parameter
CREATE OR REPLACE FUNCTION queue_required_subagents(
  p_sd_id VARCHAR(50),  -- Changed from UUID to VARCHAR(50)
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

-- 6. Recreate check_subagent_completion function with VARCHAR parameter
CREATE OR REPLACE FUNCTION check_subagent_completion(p_sd_id VARCHAR(50))
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

-- 7. Recreate validate_lead_approval function with VARCHAR parameter
CREATE OR REPLACE FUNCTION validate_lead_approval(p_sd_id VARCHAR(50))
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

-- 8. Recreate complete_subagent_work function (queue_id is still UUID, only sd_id changed)
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

-- 9. Recreate v_pending_subagent_work view
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

-- 10. Restore grants
GRANT SELECT ON sub_agent_queue TO anon, authenticated;
GRANT SELECT ON v_pending_subagent_work TO anon, authenticated;
GRANT EXECUTE ON FUNCTION queue_required_subagents TO authenticated;
GRANT EXECUTE ON FUNCTION check_subagent_completion TO authenticated;
GRANT EXECUTE ON FUNCTION validate_lead_approval TO authenticated;

-- 11. Restore comments
COMMENT ON TABLE sub_agent_queue IS 'Queue of required sub-agent activations triggered by SD events';
COMMENT ON FUNCTION queue_required_subagents IS 'Automatically queues required sub-agents based on trigger event (FIXED: sd_id is VARCHAR not UUID)';
COMMENT ON FUNCTION validate_lead_approval IS 'Validates all requirements are met before LEAD can approve SD';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify column types match
SELECT
  'sub_agent_queue.sd_id' as column_name,
  data_type,
  udt_name,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'sub_agent_queue' AND column_name = 'sd_id'

UNION ALL

SELECT
  'strategic_directives_v2.id' as column_name,
  data_type,
  udt_name,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2' AND column_name = 'id';

-- Verify foreign key constraint exists
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'sub_agent_queue'
  AND kcu.column_name = 'sd_id';

-- Show success message
SELECT 'Migration completed successfully - sd_id type mismatch fixed' as status;
