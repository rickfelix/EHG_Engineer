-- DOWN for 20260912_sd_mutation_audit_actor_threading.sql
-- Restores log_sd_mutation_audit() to the exact body applied by
-- 20260802_sd_mutation_audit_trigger.sql (2026-08-11), and drops the new helper function.
--
-- VALIDATION finding: CREATE OR REPLACE FUNCTION resets proconfig to NULL, which would silently
-- drop the search_path pin from 20260831_pin_search_path_log_sd_mutation_audit.sql on rollback
-- too if not re-asserted here. Pinned inline below so a rollback cannot reopen the CVE-2018-1058
-- mutable-search_path class this function was already patched for.

CREATE OR REPLACE FUNCTION log_sd_mutation_audit()
RETURNS TRIGGER AS $$
DECLARE
  changed TEXT;
  old_j JSONB;
  new_j JSONB;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changed := 'status';
    old_j := jsonb_build_object('status', OLD.status);
    new_j := jsonb_build_object('status', NEW.status);
    INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, metadata, severity, created_by)
    VALUES ('sd_status_change', 'strategic_directive', NEW.sd_key, old_j, new_j,
            jsonb_build_object('field', changed, 'trigger', 'trg_sd_mutation_audit', 'sd_id', NEW.id),
            'info', COALESCE(current_setting('app.actor', true), session_user));
  END IF;

  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    changed := 'current_phase';
    old_j := jsonb_build_object('current_phase', OLD.current_phase);
    new_j := jsonb_build_object('current_phase', NEW.current_phase);
    INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, metadata, severity, created_by)
    VALUES ('sd_phase_transition', 'strategic_directive', NEW.sd_key, old_j, new_j,
            jsonb_build_object('field', changed, 'trigger', 'trg_sd_mutation_audit', 'sd_id', NEW.id),
            'info', COALESCE(current_setting('app.actor', true), session_user));
  END IF;

  IF NEW.claiming_session_id IS DISTINCT FROM OLD.claiming_session_id THEN
    changed := 'claiming_session_id';
    old_j := jsonb_build_object('claiming_session_id', OLD.claiming_session_id);
    new_j := jsonb_build_object('claiming_session_id', NEW.claiming_session_id);
    INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, metadata, severity, created_by)
    VALUES (
      CASE WHEN NEW.claiming_session_id IS NULL THEN 'sd_claim_released' ELSE 'sd_claim_acquired' END,
      'strategic_directive', NEW.sd_key, old_j, new_j,
      jsonb_build_object('field', changed, 'trigger', 'trg_sd_mutation_audit', 'sd_id', NEW.id),
      'info', COALESCE(current_setting('app.actor', true), session_user));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

COMMENT ON FUNCTION log_sd_mutation_audit() IS
'SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 FR-1: writes an audit_log row per changed governed field '
'(status, current_phase, claiming_session_id) with old_value/new_value populated. Deliberately does '
'NOT log other columns — updated_at is touched on every write, so a blanket log would out-volume the '
'existing advisory traffic on a table with no retention.';

DROP TRIGGER IF EXISTS trg_sd_mutation_audit ON strategic_directives_v2;
CREATE TRIGGER trg_sd_mutation_audit
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.current_phase IS DISTINCT FROM NEW.current_phase
    OR OLD.claiming_session_id IS DISTINCT FROM NEW.claiming_session_id
  )
  EXECUTE FUNCTION log_sd_mutation_audit();

DROP FUNCTION IF EXISTS resolve_sd_mutation_audit_actor();
