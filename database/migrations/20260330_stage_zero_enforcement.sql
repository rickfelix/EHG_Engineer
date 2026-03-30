-- Migration: Stage 0 Gate Enforcement Trigger
-- SD: SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-A
--
-- Blocks direct INSERT into ventures unless:
--   1. leo.stage0_bypass session variable is set to 'true' (used by provisioner)
--   2. leo.bypass_working_on_check is set to 'true' (used by master_reset)
--
-- All venture creation must go through the Stage 0 queue (stage_zero_requests)
-- for chairman review before a venture record is created.

CREATE OR REPLACE FUNCTION trg_enforce_stage0_origin()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow bypass for provisioner and master reset
  IF current_setting('leo.stage0_bypass', true) = 'true'
     OR current_setting('leo.bypass_working_on_check', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow service_role (Supabase admin operations, queue processor)
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Log the blocked attempt
  INSERT INTO operations_audit_log (entity_type, action, severity, metadata)
  VALUES (
    'venture_creation_blocked',
    'direct_insert_prevented',
    'warning',
    jsonb_build_object(
      'venture_name', NEW.name,
      'origin_type', NEW.origin_type,
      'reason', 'Direct INSERT blocked — must use Stage 0 queue',
      'timestamp', NOW()
    )
  );

  RAISE EXCEPTION 'Venture creation must go through Stage 0 queue (POST /api/ventures). Direct INSERT is blocked. Set leo.stage0_bypass=true for provisioner operations.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_stage0_origin ON ventures;
CREATE TRIGGER trg_enforce_stage0_origin
  BEFORE INSERT ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION trg_enforce_stage0_origin();

COMMENT ON FUNCTION trg_enforce_stage0_origin() IS
  'Blocks direct INSERT into ventures. All creation must go through stage_zero_requests queue for chairman review.';
