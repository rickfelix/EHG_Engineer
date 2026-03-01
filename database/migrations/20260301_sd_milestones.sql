-- Migration: SD Milestones Table with Auto-Populating Triggers
-- SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03 (FR-002)
-- Purpose: Automatically records milestone events for each SD lifecycle via triggers

-- Step 1: Create the sd_milestones table
CREATE TABLE IF NOT EXISTS sd_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL,
  milestone_type TEXT NOT NULL,
  milestone_name TEXT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Prevent duplicate milestones for same SD + type
  UNIQUE(sd_id, milestone_type)
);

-- Step 2: Add CHECK constraint for known milestone types
ALTER TABLE sd_milestones
  ADD CONSTRAINT chk_milestone_type CHECK (
    milestone_type IN (
      'sd_created',
      'lead_approved',
      'prd_created',
      'plan_approved',
      'exec_started',
      'exec_completed',
      'pr_merged',
      'sd_completed',
      'sd_deferred',
      'sd_cancelled'
    )
  );

-- Step 3: Indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_sd_milestones_sd_id
  ON sd_milestones (sd_id);

CREATE INDEX IF NOT EXISTS idx_sd_milestones_achieved
  ON sd_milestones (achieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_sd_milestones_type
  ON sd_milestones (milestone_type);

-- Step 4: Trigger function for sd_phase_handoffs INSERT
-- Maps handoff types to milestone types
CREATE OR REPLACE FUNCTION trg_fn_sd_milestone_on_handoff()
RETURNS TRIGGER AS $$
DECLARE
  v_milestone_type TEXT;
  v_milestone_name TEXT;
BEGIN
  -- Map handoff_type to milestone
  CASE NEW.handoff_type
    WHEN 'LEAD-to-PLAN' THEN
      v_milestone_type := 'lead_approved';
      v_milestone_name := 'LEAD approved - transitioned to PLAN';
    WHEN 'PLAN-to-EXEC' THEN
      v_milestone_type := 'exec_started';
      v_milestone_name := 'EXEC phase started';
    WHEN 'EXEC-to-PLAN' THEN
      v_milestone_type := 'exec_completed';
      v_milestone_name := 'EXEC phase completed - returned to PLAN';
    WHEN 'PLAN-to-LEAD' THEN
      v_milestone_type := 'plan_approved';
      v_milestone_name := 'PLAN approved - submitted for LEAD final review';
    ELSE
      -- Unknown handoff type - skip
      RETURN NEW;
  END CASE;

  -- UPSERT: ON CONFLICT DO NOTHING prevents duplicates from retries
  INSERT INTO sd_milestones (sd_id, milestone_type, milestone_name, metadata)
  VALUES (
    NEW.sd_id::UUID,
    v_milestone_type,
    v_milestone_name,
    jsonb_build_object(
      'handoff_id', NEW.id::TEXT,
      'handoff_type', NEW.handoff_type,
      'handoff_status', NEW.status,
      'from_phase', NEW.from_phase,
      'to_phase', NEW.to_phase
    )
  )
  ON CONFLICT (sd_id, milestone_type) DO UPDATE
    SET achieved_at = NOW(),
        metadata = sd_milestones.metadata || jsonb_build_object(
          'updated_from_handoff', NEW.id::TEXT,
          'updated_at', NOW()::TEXT
        );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: log but don't block handoff creation
  RAISE WARNING 'sd_milestone trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Trigger function for strategic_directives_v2 status changes
CREATE OR REPLACE FUNCTION trg_fn_sd_milestone_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_milestone_type TEXT;
  v_milestone_name TEXT;
BEGIN
  -- Only fire on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Map status transitions to milestones
  CASE NEW.status
    WHEN 'completed' THEN
      v_milestone_type := 'sd_completed';
      v_milestone_name := 'SD completed';
    WHEN 'deferred' THEN
      v_milestone_type := 'sd_deferred';
      v_milestone_name := 'SD deferred';
    WHEN 'cancelled' THEN
      v_milestone_type := 'sd_cancelled';
      v_milestone_name := 'SD cancelled';
    ELSE
      -- Other status changes don't create milestones
      RETURN NEW;
  END CASE;

  INSERT INTO sd_milestones (sd_id, milestone_type, milestone_name, metadata)
  VALUES (
    NEW.id::UUID,
    v_milestone_type,
    v_milestone_name,
    jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'sd_key', COALESCE(NEW.sd_key, 'unknown')
    )
  )
  ON CONFLICT (sd_id, milestone_type) DO UPDATE
    SET achieved_at = NOW(),
        metadata = sd_milestones.metadata || jsonb_build_object(
          'updated_status', NEW.status,
          'updated_at', NOW()::TEXT
        );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: log but don't block SD status changes
  RAISE WARNING 'sd_milestone status trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create triggers (independent of trg_capability_lifecycle)
CREATE TRIGGER trg_sd_milestone_on_handoff
  AFTER INSERT ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_sd_milestone_on_handoff();

CREATE TRIGGER trg_sd_milestone_on_status_change
  AFTER UPDATE OF status ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_sd_milestone_on_status_change();

-- Step 7: Backfill existing completed SDs with sd_completed milestone
INSERT INTO sd_milestones (sd_id, milestone_type, milestone_name, achieved_at, metadata)
SELECT
  id::UUID,
  'sd_completed',
  'SD completed (backfill)',
  COALESCE(updated_at, created_at, NOW()),
  jsonb_build_object('backfill', true, 'sd_key', COALESCE(sd_key, 'unknown'))
FROM strategic_directives_v2
WHERE status = 'completed'
ON CONFLICT (sd_id, milestone_type) DO NOTHING;
