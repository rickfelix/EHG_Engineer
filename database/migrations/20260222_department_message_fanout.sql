-- SD-LEO-ENH-ORG-STRUCTURE-AGENT-001: Department Message Fan-Out to Agent Inboxes
-- Enhances send_department_message() to fan out to agent_messages for each department member.
--
-- Changes:
--   1. Replaces send_department_message() to add fan-out loop
--   2. For each agent in department_agents (excluding sender), inserts into agent_messages
--   3. Uses message_type='broadcast', includes source_department_id in body
--   4. Per-row exception handling for FK violations (agent removed mid-fan-out)
--   5. Backward compatible: department_messages insert unchanged

CREATE OR REPLACE FUNCTION send_department_message(
  p_department_id UUID,
  p_sender_id UUID,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_id UUID;
  v_agent RECORD;
BEGIN
  -- Step 1: Insert into department_messages (unchanged from original)
  INSERT INTO department_messages (department_id, sender_agent_id, content, metadata)
  VALUES (p_department_id, p_sender_id, p_content, p_metadata)
  RETURNING id INTO v_message_id;

  -- Step 2: Fan out to agent_messages for each department member (excluding sender)
  FOR v_agent IN
    SELECT da.agent_id
    FROM department_agents da
    WHERE da.department_id = p_department_id
      AND da.agent_id != p_sender_id
  LOOP
    BEGIN
      INSERT INTO agent_messages (
        message_type,
        from_agent_id,
        to_agent_id,
        subject,
        body,
        priority,
        status
      ) VALUES (
        'broadcast',
        p_sender_id,
        v_agent.agent_id,
        'Department message',
        jsonb_build_object(
          'source_department_id', p_department_id,
          'department_message_id', v_message_id,
          'content', p_content
        ) || p_metadata,
        'normal',
        'pending'
      );
    EXCEPTION
      WHEN foreign_key_violation THEN
        RAISE WARNING 'Skipping agent % - FK violation (agent may have been removed)', v_agent.agent_id;
        CONTINUE;
    END;
  END LOOP;

  RETURN v_message_id;
END;
$$;
