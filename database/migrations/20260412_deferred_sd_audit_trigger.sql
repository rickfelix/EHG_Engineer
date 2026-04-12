-- SD-LEO-INFRA-CONDITIONAL-QUEUE-GOVERNANCE-001
-- Governance metadata audit trail for deferred Strategic Directives
-- Creates: sd_metadata_audit_log table, BEFORE UPDATE trigger, CHECK constraint

-- 1. Audit log table
-- NOTE: sd_id is VARCHAR(50) to match strategic_directives_v2.id column type (not UUID)
CREATE TABLE IF NOT EXISTS sd_metadata_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
  changed_field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by TEXT DEFAULT current_user,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sd_metadata_audit_sd_id ON sd_metadata_audit_log(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_metadata_audit_changed_at ON sd_metadata_audit_log(changed_at DESC);

COMMENT ON TABLE sd_metadata_audit_log IS 'Immutable audit trail for governance metadata mutations on strategic_directives_v2. Board of Directors requirement (CISO).';

-- 2. BEFORE UPDATE trigger: logs governance key mutations
CREATE OR REPLACE FUNCTION trg_audit_governance_metadata()
RETURNS TRIGGER AS $$
DECLARE
  gov_keys TEXT[] := ARRAY['do_not_advance_without_trigger', 'chairman_decision_required', 'auto_cancel_after_days', 'trigger_condition', 'is_pareto_deferred'];
  k TEXT;
BEGIN
  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    FOREACH k IN ARRAY gov_keys LOOP
      IF (OLD.metadata->k) IS DISTINCT FROM (NEW.metadata->k) THEN
        INSERT INTO sd_metadata_audit_log (sd_id, changed_field, old_value, new_value)
        VALUES (NEW.id, k, OLD.metadata->k, NEW.metadata->k);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sd_governance_metadata_audit ON strategic_directives_v2;
CREATE TRIGGER trg_sd_governance_metadata_audit
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_governance_metadata();

-- 3. CHECK constraint: do_not_advance_without_trigger requires trigger_condition
ALTER TABLE strategic_directives_v2
  DROP CONSTRAINT IF EXISTS chk_deferred_requires_trigger_condition;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT chk_deferred_requires_trigger_condition
  CHECK (
    NOT (
      (metadata->>'do_not_advance_without_trigger')::boolean = true
      AND metadata->'trigger_condition' IS NULL
    )
  );

COMMENT ON CONSTRAINT chk_deferred_requires_trigger_condition ON strategic_directives_v2
  IS 'Prevents setting do_not_advance_without_trigger=true without specifying a trigger_condition';
