-- LEO Self-Improvement Data-Plane Integration Migration
-- SD: SD-LEO-SELF-IMPROVE-001L (Phase 7a: Data-Plane Integration)
-- Purpose: Add idempotency support to leo_events and create integration_config table
-- FR-1: leo_events idempotency (processed_at, idempotency_key columns)
-- FR-6: integration_config table for pipeline configuration

-- =============================================================================
-- FR-1: Add idempotency columns to leo_events
-- =============================================================================

-- Add processed_at column for tracking event processing state
ALTER TABLE leo_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL;

-- Add idempotency_key column for preventing duplicate event processing
ALTER TABLE leo_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

-- Create UNIQUE index on idempotency_key (partial index for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leo_events_idempotency_key
  ON leo_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add index for querying processed events
CREATE INDEX IF NOT EXISTS idx_leo_events_processed_at
  ON leo_events (processed_at DESC NULLS LAST);

-- Add index for unprocessed events (pipeline workqueue query)
CREATE INDEX IF NOT EXISTS idx_leo_events_unprocessed
  ON leo_events (entity_type, created_at DESC)
  WHERE processed_at IS NULL;

-- =============================================================================
-- FR-1: Modify append-only trigger to allow UPDATE on processed_at ONLY
-- =============================================================================

-- Replace the trigger function to allow UPDATE ONLY on processed_at column
CREATE OR REPLACE FUNCTION leo_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  -- BLOCK all DELETE operations
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'events_append_only: DELETE is not allowed on leo_events';
  END IF;

  -- ALLOW UPDATE only if:
  -- 1. ONLY processed_at column is being updated
  -- 2. All other columns remain unchanged
  IF TG_OP = 'UPDATE' THEN
    -- Check if processed_at is the only field being changed
    -- (Compare OLD and NEW excluding processed_at)
    IF (
      OLD.id IS DISTINCT FROM NEW.id OR
      OLD.created_at IS DISTINCT FROM NEW.created_at OR
      OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id OR
      OLD.actor_type IS DISTINCT FROM NEW.actor_type OR
      OLD.event_name IS DISTINCT FROM NEW.event_name OR
      OLD.entity_type IS DISTINCT FROM NEW.entity_type OR
      OLD.entity_id IS DISTINCT FROM NEW.entity_id OR
      OLD.correlation_id IS DISTINCT FROM NEW.correlation_id OR
      OLD.request_id IS DISTINCT FROM NEW.request_id OR
      OLD.severity IS DISTINCT FROM NEW.severity OR
      OLD.payload IS DISTINCT FROM NEW.payload OR
      OLD.pii_level IS DISTINCT FROM NEW.pii_level OR
      OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    ) THEN
      RAISE EXCEPTION 'events_append_only: UPDATE is only allowed on processed_at column';
    END IF;

    -- Allow the update (only processed_at is changing)
    RETURN NEW;
  END IF;

  -- Should never reach here, but return NEW as safety
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers are already created in 20260131_leo_self_improve_data_contracts.sql
-- No need to recreate them - function replacement is sufficient

-- =============================================================================
-- FR-1: Expand entity_type constraint for pipeline stages
-- =============================================================================

-- Drop existing CHECK constraint
ALTER TABLE leo_events
  DROP CONSTRAINT IF EXISTS leo_events_entity_type_check;

-- Add new CHECK constraint with pipeline stage entity types
ALTER TABLE leo_events
  ADD CONSTRAINT leo_events_entity_type_check CHECK (
    entity_type IN (
      -- Original entity types (from SD-LEO-SELF-IMPROVE-001B)
      'proposal',
      'rubric',
      'prioritization_config',
      'audit_config',
      'feature_flag',
      'prompt',
      -- New pipeline stage entity types (SD-LEO-SELF-IMPROVE-001L)
      'feedback_intake',
      'proposal_creation',
      'prioritization',
      'execution_enqueue'
    )
  );

-- =============================================================================
-- FR-6: integration_config table for database-backed pipeline configuration
-- =============================================================================

CREATE TABLE IF NOT EXISTS integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_integration_config_key UNIQUE (config_key)
);

-- Index for active config lookups
CREATE INDEX IF NOT EXISTS idx_integration_config_active
  ON integration_config (is_active, config_key);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION integration_config_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_config_update_timestamp ON integration_config;
CREATE TRIGGER trg_integration_config_update_timestamp
  BEFORE UPDATE ON integration_config
  FOR EACH ROW
  EXECUTE FUNCTION integration_config_update_timestamp();

-- =============================================================================
-- RLS Policies for integration_config (service role only)
-- =============================================================================

ALTER TABLE integration_config ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to integration_config"
  ON integration_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Seed initial integration_config values
-- =============================================================================

INSERT INTO integration_config (config_key, config_value, description, is_active) VALUES
  (
    'pipeline_processing_config',
    '{
      "batch_size": 10,
      "processing_timeout_seconds": 300,
      "retry_max_attempts": 3,
      "retry_backoff_base_seconds": 2
    }'::jsonb,
    'Global configuration for data-plane pipeline processing',
    true
  ),
  (
    'event_routing_config',
    '{
      "feedback_intake": {"enabled": true, "handler": "process-feedback-intake"},
      "proposal_creation": {"enabled": true, "handler": "process-proposal-creation"},
      "prioritization": {"enabled": true, "handler": "process-prioritization"},
      "execution_enqueue": {"enabled": true, "handler": "process-execution-enqueue"}
    }'::jsonb,
    'Event routing configuration mapping entity_type to processing handlers',
    true
  )
ON CONFLICT (config_key) DO NOTHING;

-- =============================================================================
-- Completion marker
-- =============================================================================
COMMENT ON COLUMN leo_events.processed_at IS 'Timestamp when event was processed by data-plane pipeline. NULL = unprocessed. SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON COLUMN leo_events.idempotency_key IS 'Optional unique key for idempotent event processing. SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON TABLE integration_config IS 'Database-backed configuration for data-plane pipeline integration. SD: SD-LEO-SELF-IMPROVE-001L';
