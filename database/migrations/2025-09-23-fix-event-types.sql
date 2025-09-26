-- Fix event types constraint to include all necessary types
-- Adds missing event types for the event system

-- Drop the existing constraint
ALTER TABLE agent_events
DROP CONSTRAINT IF EXISTS agent_events_event_type_check;

-- Add new constraint with all event types
ALTER TABLE agent_events
ADD CONSTRAINT agent_events_event_type_check
CHECK (event_type IN (
  -- Lifecycle Events
  'ANALYSIS_START',
  'ANALYSIS_COMPLETE',

  -- Discovery Events
  'FINDING_DETECTED',
  'PATTERN_IDENTIFIED',

  -- Validation Events
  'VALIDATION_PASSED',
  'VALIDATION_FAILED',

  -- Coordination Events
  'HANDOFF_CREATED',
  'CONSENSUS_REQUIRED',
  'HUMAN_REVIEW_REQUIRED',

  -- System Events
  'ERROR',
  'WARNING',
  'CHECKPOINT',
  'RECOVERY'
));

-- Add RPC function for acknowledging events
CREATE OR REPLACE FUNCTION acknowledge_event(
  p_event_id TEXT,
  p_agent_code TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_events
  SET
    acknowledged_by = array_append(
      COALESCE(acknowledged_by, ARRAY[]::TEXT[]),
      p_agent_code
    ),
    responses = jsonb_set(
      COALESCE(responses, '{}'::jsonb),
      ARRAY[p_agent_code],
      jsonb_build_object(
        'acknowledged', true,
        'timestamp', now()
      )
    )
  WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Add index for event lookups
CREATE INDEX IF NOT EXISTS idx_events_event_id ON agent_events(event_id);

-- Add index for checkpoint lookups
CREATE INDEX IF NOT EXISTS idx_events_checkpoint
ON agent_events(event_type, (payload->>'checkpointId'))
WHERE event_type = 'CHECKPOINT';