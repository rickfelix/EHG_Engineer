-- Migration: SD Completed Return Path
-- SD: SD-EVA-FEAT-RETURN-PATH-001
-- Purpose: Add sd.completed event type and trigger for LEO SD completion → Stage 19 progress sync

-- Step 1: Expand event_type constraint to include sd.completed
ALTER TABLE eva_events DROP CONSTRAINT IF EXISTS eva_events_event_type_check;
ALTER TABLE eva_events ADD CONSTRAINT eva_events_event_type_check
  CHECK (event_type IN (
    -- Original types
    'metric_update', 'health_change', 'decision_required',
    'alert_triggered', 'automation_executed', 'status_change',
    'milestone_reached', 'risk_detected', 'user_action',
    'stage_processing_started', 'stage_processing_completed',
    'stage_processing_started', 'stage_processing_failed',
    -- Event bus handler types (SD-EVA-FEAT-EVENT-BUS-001)
    'stage.completed', 'decision.submitted', 'gate.evaluated',
    -- Return path type (SD-EVA-FEAT-RETURN-PATH-001)
    'sd.completed'
  ));

-- Step 2: Create trigger function to emit sd.completed event
-- Fires when strategic_directives_v2.status transitions to 'completed'
-- Only emits for SDs that have venture metadata (created via lifecycle-sd-bridge)
CREATE OR REPLACE FUNCTION fn_emit_sd_completed_event()
RETURNS TRIGGER AS $$
DECLARE
  v_venture_id UUID;
  v_parent_sd_key TEXT;
  v_parent_uuid UUID;
  v_event_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Only fire on status transition to 'completed'
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RETURN NEW; -- Already completed, no re-emit
  END IF;

  -- Extract venture_id from metadata (only lifecycle-bridge SDs have this)
  v_venture_id := (NEW.metadata->>'venture_id')::UUID;

  -- If no venture_id, this SD is not part of EVA lifecycle - skip
  IF v_venture_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find parent SD key if this is a child
  IF NEW.parent_sd_id IS NOT NULL THEN
    SELECT sd_key INTO v_parent_sd_key
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    v_parent_uuid := NEW.parent_sd_id;
  END IF;

  -- Build idempotency key
  v_idempotency_key := 'sd.completed:' || NEW.sd_key || ':' || NEW.id;

  -- Insert event into eva_events
  INSERT INTO eva_events (
    eva_venture_id,
    event_type,
    event_data,
    idempotency_key,
    processed,
    retry_count
  ) VALUES (
    v_venture_id,
    'sd.completed',
    jsonb_build_object(
      'sdKey', NEW.sd_key,
      'sdId', NEW.id,
      'ventureId', v_venture_id::TEXT,
      'parentSdId', v_parent_uuid::TEXT,
      'parentSdKey', v_parent_sd_key,
      'sdType', NEW.sd_type,
      'title', NEW.title,
      'completedAt', NOW()::TEXT,
      'progress', NEW.progress
    ),
    v_idempotency_key,
    FALSE,
    0
  )
  ON CONFLICT (idempotency_key) DO NOTHING; -- Idempotent

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger on strategic_directives_v2
DROP TRIGGER IF EXISTS tr_sd_completed_event ON strategic_directives_v2;
CREATE TRIGGER tr_sd_completed_event
  AFTER UPDATE OF status ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION fn_emit_sd_completed_event();

-- Step 4: Add index for venture_stage_work lookups by venture + stage
CREATE INDEX IF NOT EXISTS idx_venture_stage_work_venture_stage
  ON venture_stage_work (venture_id, lifecycle_stage);
