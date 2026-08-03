-- SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 (FR-1)
-- Mutation auditing for strategic_directives_v2: status, current_phase, claiming_session_id.
--
-- WHY THIS EXISTS
-- audit_log holds 232,811 rows and is actively written, but old_value — the column that
-- distinguishes a MUTATION record from a creation advisory — is populated in 388 of them
-- (0.167%), against new_value at 97.1%. The table was BUILT for mutations (it has old_value and
-- new_value) and has only ever been used for creation provenance, plus two fields that happened to
-- get purpose-built governance triggers. Measured consequence: twelve consequential state changes
-- in one night left no trace, reconstructible only because an operator voluntarily wrote priors
-- into metadata — an authorial habit, not a control.
--
-- WHY IT IS FIELD-SCOPED, WHICH IS THE WHOLE DESIGN
-- update_strategic_directives_v2_updated_at (database/schema/001_initial_schema.sql:121) fires on
-- EVERY write to this table, so an unfiltered AFTER UPDATE audit trigger would emit a row per
-- touch. audit_log already carries a 214,099-row advisory flood the SD calls unreadable, and it
-- has NO retention implemented (no pruning machinery exists for this table anywhere in the repo;
-- 20260124_aegis_phase5_rules.sql documents audit_logs=365d as a minimum that nothing enforces).
-- So every row added here is permanent, and a blanket trigger would make the ledger LESS readable
-- while claiming to fix it. The WHEN clause below is the load-bearing part of this migration.
--
-- SHAPE
-- Follows the writer that already works — 20260202_sd_type_change_governance_fixed.sql:115 —
-- jsonb_build_object of OLD and NEW into old_value/new_value, entity_type 'strategic_directive',
-- entity_id = sd_key. That keeps the new rows queryable alongside the 388 existing mutation rows
-- rather than starting a second, differently-shaped record.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_sd_mutation_audit ON strategic_directives_v2;
--   DROP FUNCTION IF EXISTS log_sd_mutation_audit();

CREATE OR REPLACE FUNCTION log_sd_mutation_audit()
RETURNS TRIGGER AS $$
DECLARE
  changed TEXT;
  old_j JSONB;
  new_j JSONB;
BEGIN
  -- One row per CHANGED FIELD rather than one row per UPDATE carrying a diff: a reader asking
  -- "when did this SD's claim change" should not have to parse a blob that also contains a phase
  -- change. Matches how the existing sd_type writer records a single field.
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

  -- Claim ACQUIRE and RELEASE are both recorded. Release is the direction that matters
  -- operationally: the untraced mutations that motivated this SD included a stale
  -- claiming_session_id clear, and a claim that vanished with no record is the shape that makes a
  -- stranded SD impossible to attribute afterwards.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_sd_mutation_audit() IS
'SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 FR-1: writes an audit_log row per changed governed field '
'(status, current_phase, claiming_session_id) with old_value/new_value populated. Deliberately does '
'NOT log other columns — updated_at is touched on every write, so a blanket log would out-volume the '
'existing advisory traffic on a table with no retention.';

-- The WHEN clause is a second, independent guard on the same invariant the IF blocks enforce: even
-- if a future edit adds a field to the body, the trigger still does not FIRE for updates that touch
-- none of the three. Belt and braces on the one property that keeps this from becoming a flood.
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
