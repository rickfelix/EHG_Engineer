-- Workflow Checkpoint System
-- Implements state persistence for multi-agent workflows

-- Create workflow checkpoints table
CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  agent_code TEXT NOT NULL,
  phase TEXT NOT NULL,
  state JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_workflow
ON workflow_checkpoints(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_agent
ON workflow_checkpoints(agent_code);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_phase
ON workflow_checkpoints(phase);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_created
ON workflow_checkpoints(created_at DESC);

-- Add workflow recovery state tracking
CREATE TABLE IF NOT EXISTS workflow_recovery_state (
  workflow_id TEXT PRIMARY KEY,
  last_checkpoint_id TEXT,
  recovery_attempts INTEGER DEFAULT 0,
  last_recovery_at TIMESTAMP,
  recovery_status TEXT CHECK (recovery_status IN ('SUCCESS', 'FAILED', 'IN_PROGRESS', 'PENDING')),
  error_details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Function to clean old checkpoints
CREATE OR REPLACE FUNCTION cleanup_old_checkpoints(
  p_workflow_id TEXT DEFAULT NULL,
  p_keep_count INTEGER DEFAULT 5
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete old checkpoints keeping only the most recent p_keep_count
  WITH ranked_checkpoints AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY workflow_id
             ORDER BY created_at DESC
           ) as rn
    FROM workflow_checkpoints
    WHERE p_workflow_id IS NULL OR workflow_id = p_workflow_id
  )
  DELETE FROM workflow_checkpoints
  WHERE id IN (
    SELECT id FROM ranked_checkpoints WHERE rn > p_keep_count
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get latest checkpoint for workflow
CREATE OR REPLACE FUNCTION get_latest_checkpoint(
  p_workflow_id TEXT
)
RETURNS workflow_checkpoints AS $$
BEGIN
  RETURN (
    SELECT * FROM workflow_checkpoints
    WHERE workflow_id = p_workflow_id
    ORDER BY created_at DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_checkpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE ON workflow_recovery_state TO authenticated;

-- Add comments
COMMENT ON TABLE workflow_checkpoints IS 'Stores workflow state checkpoints for recovery';
COMMENT ON TABLE workflow_recovery_state IS 'Tracks recovery attempts and status';
COMMENT ON FUNCTION cleanup_old_checkpoints IS 'Removes old checkpoints keeping only recent ones';
COMMENT ON FUNCTION get_latest_checkpoint IS 'Gets the most recent checkpoint for a workflow';