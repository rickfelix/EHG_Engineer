-- Migration: EVA Event Bus Handler Wiring
-- SD: SD-EVA-FEAT-EVENT-BUS-001
-- Purpose: Add handler registry, DLQ, event ledger, and expand event types

-- Step 1: Expand event_type constraint to include all required types
ALTER TABLE eva_events DROP CONSTRAINT IF EXISTS eva_events_event_type_check;
ALTER TABLE eva_events ADD CONSTRAINT eva_events_event_type_check
  CHECK (event_type IN (
    -- Original types
    'metric_update', 'health_change', 'decision_required',
    'alert_triggered', 'automation_executed', 'status_change',
    'milestone_reached', 'risk_detected', 'user_action',
    -- Orchestrator lifecycle types
    'stage_processing_started', 'stage_processing_failed',
    -- Event bus handler types (SD-EVA-FEAT-EVENT-BUS-001)
    'stage.completed', 'decision.submitted', 'gate.evaluated'
  ));

-- Step 2: Add processing tracking columns to eva_events
ALTER TABLE eva_events ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE eva_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE eva_events ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Unique index on idempotency_key (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_eva_events_idempotency_key
  ON eva_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Step 3: Create event processing ledger
CREATE TABLE IF NOT EXISTS eva_event_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eva_events(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  handler_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'dead', 'replayed')),
  attempts INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  error_stack TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eva_event_ledger_event_id ON eva_event_ledger(event_id);
CREATE INDEX IF NOT EXISTS idx_eva_event_ledger_status ON eva_event_ledger(status);
CREATE INDEX IF NOT EXISTS idx_eva_event_ledger_event_type ON eva_event_ledger(event_type);

-- Step 4: Create Dead Letter Queue table
CREATE TABLE IF NOT EXISTS eva_events_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES eva_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL,
  error_stack TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  failure_reason TEXT NOT NULL CHECK (failure_reason IN ('validation_error', 'max_retries_exhausted', 'not_found', 'handler_error', 'unknown')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'dead' CHECK (status IN ('dead', 'replayed', 'discarded')),
  replayed_at TIMESTAMPTZ,
  replayed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eva_events_dlq_status ON eva_events_dlq(status);
CREATE INDEX IF NOT EXISTS idx_eva_events_dlq_event_type ON eva_events_dlq(event_type);
CREATE INDEX IF NOT EXISTS idx_eva_events_dlq_event_id ON eva_events_dlq(event_id);

-- Step 5: Feature flag via eva_config table (create if not exists)
CREATE TABLE IF NOT EXISTS eva_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO eva_config (key, value, description)
VALUES ('event_bus.enabled', 'false', 'Enable event bus handler processing for stage.completed, decision.submitted, gate.evaluated')
ON CONFLICT (key) DO NOTHING;

INSERT INTO eva_config (key, value, description)
VALUES ('event_bus.max_retries', '3', 'Maximum retry attempts for transient handler failures')
ON CONFLICT (key) DO NOTHING;

-- Step 6: Update process_eva_event to support handler routing
CREATE OR REPLACE FUNCTION process_eva_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_event RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_event FROM eva_events WHERE id = p_event_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Event not found');
    END IF;

    -- Check idempotency - if already processed, return early
    IF v_event.processed = TRUE THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_processed', 'event_id', p_event_id);
    END IF;

    -- Mark as processed
    UPDATE eva_events
    SET processed = TRUE, processed_at = NOW()
    WHERE id = p_event_id;

    -- Log to audit
    INSERT INTO eva_audit_log (eva_venture_id, action_type, action_data)
    VALUES (v_event.eva_venture_id, 'event_processed', jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event.event_type,
        'processed_at', NOW()
    ));

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'event_type', v_event.event_type,
        'venture_id', v_event.eva_venture_id
    );
END;
$$;
