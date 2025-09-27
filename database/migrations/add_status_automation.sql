-- SD-LEO-002: Automate Database Status Transitions
-- Created: 2025-09-27T12:09:59.887Z

-- 1. Status transition rules table
CREATE TABLE IF NOT EXISTS status_transition_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  condition_type VARCHAR(50) NOT NULL, -- 'phase_complete', 'approval_granted', etc
  condition_value JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Transition audit log
CREATE TABLE IF NOT EXISTS status_transition_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sd_id VARCHAR(50) NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  triggered_by VARCHAR(50) NOT NULL, -- 'auto', 'manual', 'rollback'
  trigger_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Validation function
CREATE OR REPLACE FUNCTION validate_status_transition(
  p_sd_id VARCHAR,
  p_from_status VARCHAR,
  p_to_status VARCHAR
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if transition is allowed
  IF EXISTS (
    SELECT 1 FROM status_transition_rules
    WHERE from_status = p_from_status
    AND to_status = p_to_status
    AND active = true
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- 4. Auto-transition function
CREATE OR REPLACE FUNCTION auto_transition_status() RETURNS TRIGGER AS $$
DECLARE
  v_new_status VARCHAR;
BEGIN
  -- Determine new status based on completion
  IF NEW.phase = 'EXEC' AND NEW.progress >= 100 THEN
    v_new_status := 'pending_verification';
  ELSIF NEW.phase = 'VERIFICATION' AND NEW.confidence_score >= 85 THEN
    v_new_status := 'pending_approval';
  ELSIF NEW.phase = 'APPROVAL' AND NEW.approval_status = 'approved' THEN
    v_new_status := 'completed';
  ELSE
    RETURN NEW;
  END IF;
  
  -- Validate transition
  IF validate_status_transition(NEW.id, NEW.status, v_new_status) THEN
    -- Update status
    NEW.status := v_new_status;
    
    -- Log transition
    INSERT INTO status_transition_audit (
      sd_id, from_status, to_status, triggered_by, trigger_details
    ) VALUES (
      NEW.id, OLD.status, v_new_status, 'auto',
      jsonb_build_object('phase', NEW.phase, 'progress', NEW.progress)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger
CREATE TRIGGER status_auto_transition
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_transition_status();

-- 6. Insert default transition rules
INSERT INTO status_transition_rules (from_status, to_status, condition_type) VALUES
  ('draft', 'active', 'approval_granted'),
  ('active', 'in_progress', 'phase_started'),
  ('in_progress', 'pending_verification', 'exec_complete'),
  ('pending_verification', 'pending_approval', 'verification_pass'),
  ('pending_approval', 'completed', 'lead_approval'),
  ('pending_approval', 'in_progress', 'approval_rejected');

-- 7. Rollback function
CREATE OR REPLACE FUNCTION rollback_status_transition(
  p_sd_id VARCHAR
) RETURNS VOID AS $$
DECLARE
  v_previous_status VARCHAR;
BEGIN
  -- Get previous status from audit
  SELECT from_status INTO v_previous_status
  FROM status_transition_audit
  WHERE sd_id = p_sd_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_previous_status IS NOT NULL THEN
    -- Update SD status
    UPDATE strategic_directives_v2
    SET status = v_previous_status
    WHERE id = p_sd_id;
    
    -- Log rollback
    INSERT INTO status_transition_audit (
      sd_id, from_status, to_status, triggered_by
    ) VALUES (
      p_sd_id, 
      (SELECT status FROM strategic_directives_v2 WHERE id = p_sd_id),
      v_previous_status, 
      'rollback'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE status_transition_rules IS 'SD-LEO-002: Automated status transition rules';
COMMENT ON TABLE status_transition_audit IS 'SD-LEO-002: Audit log for all status changes';
COMMENT ON FUNCTION auto_transition_status() IS 'SD-LEO-002: Automatic status transition trigger';
