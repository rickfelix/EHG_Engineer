-- Migration: Lock validation_gate_registry against silent disables of protected gates
-- SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001 (FR-3 / US-003)
-- Date: 2026-04-28
--
-- Background: Without this trigger, any UPDATE on validation_gate_registry can
-- set enabled=false on critical gates (PR_MERGE_VERIFICATION, the new
-- SHIP_REVIEW_FINDINGS_PROOF), silently bypassing the entire phantom-completion
-- protection. This trigger requires a documented disable_reason citing either
-- a --pattern-id (issue_patterns row) OR --followup-sd-key (strategic_directives_v2
-- row) — mirrors validateBypassShape's dual-key requirement.
--
-- Idempotent: uses CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION validation_gate_registry_lock_trigger()
RETURNS TRIGGER AS $$
DECLARE
  protected_gates TEXT[] := ARRAY['PR_MERGE_VERIFICATION', 'SHIP_REVIEW_FINDINGS_PROOF'];
  reason_text TEXT;
  has_pattern_id BOOLEAN := FALSE;
  has_followup_sd BOOLEAN := FALSE;
BEGIN
  -- Only fire when disabling a protected gate
  IF NEW.gate_name = ANY(protected_gates) AND OLD.enabled = TRUE AND NEW.enabled = FALSE THEN
    reason_text := COALESCE(NEW.metadata->>'disable_reason', '');

    -- Require either --pattern-id <PAT-XXX> OR --followup-sd-key <SD-XXX> in the reason
    has_pattern_id := reason_text ~ '--pattern-id\s+PAT-[A-Z0-9-]+';
    has_followup_sd := reason_text ~ '--followup-sd-key\s+SD-[A-Z0-9-]+';

    IF NOT (has_pattern_id OR has_followup_sd) THEN
      RAISE EXCEPTION 'Cannot disable protected gate "%": metadata.disable_reason must include --pattern-id <PAT-XXX> or --followup-sd-key <SD-XXX>. Got: "%"',
        NEW.gate_name, reason_text
      USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validation_gate_registry_lock ON validation_gate_registry;

CREATE TRIGGER trigger_validation_gate_registry_lock
  BEFORE UPDATE ON validation_gate_registry
  FOR EACH ROW
  EXECUTE FUNCTION validation_gate_registry_lock_trigger();

COMMENT ON FUNCTION validation_gate_registry_lock_trigger() IS
  'SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001: Rejects silent disables of PR_MERGE_VERIFICATION and SHIP_REVIEW_FINDINGS_PROOF without documented bypass justification.';
